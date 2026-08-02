package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/mapper"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	appvalidator "github.com/SandaruwanWeerawardhana/pos-backend/internal/validator"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/pagination"
)

type OrderHandler struct {
	sync   service.OrderSyncService
	orders service.OrderService
}

func NewOrderHandler(sync service.OrderSyncService, orders service.OrderService) *OrderHandler {
	return &OrderHandler{sync: sync, orders: orders}
}

// List serves GET /orders: one page of the business's sales, newest first.
//
// Paginated, unlike GET /products. The catalogue is bounded and the till caches
// all of it to sell offline; sales history only grows, and no screen needs the
// whole of it at once.
//
// The response keys orders by client_generated_id as well as id, because the
// client overlays its own unsynced sales on this list and needs to recognise
// the ones it has already pushed.
func (h *OrderHandler) List(c *fiber.Ctx) error {
	var query dto.OrderListQuery
	if err := c.QueryParser(&query); err != nil {
		return apperror.Wrap(apperror.CodeBadRequest, "invalid query parameters", err)
	}
	if err := appvalidator.Struct(&query); err != nil {
		return err
	}

	// Parse clamps page/per_page and rejects a sort field that is not on the
	// whitelist. That check is load-bearing: Sort is interpolated into ORDER BY
	// further down, which GORM does not escape.
	params, err := pagination.Parse(
		query.Page, query.PerPage, query.Sort, query.Order, query.Search,
		dto.OrderSortFields,
	)
	if err != nil {
		return err
	}

	from, to, err := parseSoldAtWindow(query.From, query.To)
	if err != nil {
		return err
	}

	page, err := h.orders.List(c.UserContext(), middleware.BusinessID(c), service.OrderListQuery{
		Limit:         params.PerPage,
		Offset:        params.Offset(),
		Sort:          params.Sort,
		Order:         params.Order,
		Search:        params.Search,
		PaymentMethod: query.PaymentMethod,
		From:          from,
		To:            to,
	})
	if err != nil {
		return err
	}

	return ok(c, fiber.StatusOK, dto.OrderListResponse{
		Orders: mapper.ToOrderResponseList(page.Orders),
		Meta:   pagination.NewMeta(params, page.Total),
	})
}

// Get serves GET /orders/{clientGeneratedID}, the receipt behind one sale.
//
// Keyed on the till's own id rather than the server's, because that is what the
// client holds and what its sales list links to. A sale it has not pushed yet
// has no server row at all, so the client must fall back to its local copy on a
// 404 rather than treating it as an error.
func (h *OrderHandler) Get(c *fiber.Ctx) error {
	clientGeneratedID := c.Params("clientGeneratedID")
	if clientGeneratedID == "" {
		return apperror.New(apperror.CodeValidationError, "client_generated_id is required")
	}

	order, err := h.orders.GetByClientID(
		c.UserContext(), middleware.BusinessID(c), clientGeneratedID,
	)
	if err != nil {
		return err
	}

	return ok(c, fiber.StatusOK, mapper.ToOrderResponse(*order))
}

// parseSoldAtWindow converts the epoch-millisecond bounds into times, rejecting
// an inverted range rather than silently returning nothing — a screen showing
// zero sales for a range it thinks is valid reads as lost revenue.
func parseSoldAtWindow(fromMillis, toMillis int64) (from, to time.Time, err error) {
	if fromMillis > 0 {
		from = time.UnixMilli(fromMillis)
	}
	if toMillis > 0 {
		to = time.UnixMilli(toMillis)
	}
	if !from.IsZero() && !to.IsZero() && to.Before(from) {
		return time.Time{}, time.Time{}, apperror.WithFields(
			apperror.CodeValidationError,
			"validation failed",
			[]apperror.FieldError{{
				Field:   "to",
				Rule:    "gtefield",
				Message: "to must not be earlier than from",
			}},
		)
	}
	return from, to, nil
}

// Sync serves POST /orders/sync.
//
// The response must contain exactly one result per submitted order. An order
// the client sent but does not find in results stays "syncing" in its local
// database indefinitely — nothing re-queues it, and only a page reload recovers
// it — so a missing entry is a data-loss path, not a cosmetic gap. The
// outcome-count check below exists to make that failure loud rather than silent.
func (h *OrderHandler) Sync(c *fiber.Ctx) error {
	var req dto.SyncOrdersRequest
	if err := parseAndValidate(c, &req); err != nil {
		return err
	}

	branchID := branchIDOrNil(c)
	// The authenticated user is the fallback attribution for a sale whose body
	// carries no cashier_id. Without it those orders landed with a NULL
	// cashier_id and dropped out of every per-cashier report, even though the
	// request was made by a known, logged-in user. A cashier_id the client does
	// send is still honoured: Phase 2 staff/PIN auth rings up sales under the
	// staff member rather than the device's token holder.
	tokenUserID := middleware.UserID(c)

	inputs := make([]service.SyncOrderInput, 0, len(req.Orders))
	for _, order := range req.Orders {
		in := toSyncOrderInput(order)
		if in.CashierID == nil && tokenUserID != uuid.Nil {
			in.CashierID = &tokenUserID
		}
		inputs = append(inputs, in)
	}

	outcomes := h.sync.Sync(c.UserContext(), middleware.BusinessID(c), branchID, inputs)

	// The service contract is one outcome per input, in order. If that ever
	// breaks, returning a short list would strand sales on the till; failing the
	// whole request instead leaves every order "pending" and retryable.
	if len(outcomes) != len(req.Orders) {
		return fiber.NewError(
			fiber.StatusInternalServerError,
			"sync produced an incomplete result set",
		)
	}

	results := make([]dto.SyncOrderOutcome, 0, len(outcomes))
	for _, outcome := range outcomes {
		results = append(results, dto.SyncOrderOutcome{
			ClientGeneratedID: outcome.ClientGeneratedID,
			Result:            string(outcome.Result),
			ServerID:          outcome.ServerID,
		})
	}

	// 200 even when individual orders failed: the per-order result carries that
	// detail, and a non-2xx would make the client treat the entire batch as a
	// transport failure and resend orders it has already been told about.
	return ok(c, fiber.StatusOK, dto.SyncOrdersResponse{Results: results})
}

func toSyncOrderInput(in dto.SyncOrderInput) service.SyncOrderInput {
	out := service.SyncOrderInput{
		ClientGeneratedID: in.ClientGeneratedID,
		ReceiptNo:         in.ReceiptNo,
		TotalCents:        in.TotalCents.Int64(),
		TaxTotalCents:     in.TaxTotalCents.Int64(),
		DiscountCents:     in.DiscountCents.Int64(),
		PaymentMethod:     in.PaymentMethod,
		// The client sends epoch milliseconds from the till's own clock; it is
		// the sale's business date, so it is preserved rather than replaced with
		// the server's receive time.
		SoldAt: time.UnixMilli(in.CreatedAt),
	}
	if id, err := uuid.Parse(in.CashierID); err == nil {
		out.CashierID = &id
	}

	out.Items = make([]service.SyncOrderItem, 0, len(in.Items))
	for _, item := range in.Items {
		si := service.SyncOrderItem{
			Name:              item.Name,
			Quantity:          item.Quantity,
			UnitPriceCents:    item.UnitPriceCents.Int64(),
			TaxRate:           item.TaxRate,
			Unit:              item.Unit,
			IsWeighted:        item.IsWeighted,
			LineDiscountCents: item.LineDiscountCents.Int64(),
		}
		// A locally-created product has an id the server has never seen, and
		// products are not yet pushed up (Phase 2). An unparseable id therefore
		// means "no server product", which the sale still records by name.
		if id, err := uuid.Parse(item.ProductID); err == nil {
			si.ProductID = &id
		}
		out.Items = append(out.Items, si)
	}

	out.Payments = make([]service.SyncOrderPayment, 0, len(in.Payments))
	for _, p := range in.Payments {
		out.Payments = append(out.Payments, service.SyncOrderPayment{
			Method:        p.Method,
			AmountCents:   p.AmountCents.Int64(),
			TenderedCents: centsPtrToInt64Ptr(p.TenderedCents),
			ChangeCents:   centsPtrToInt64Ptr(p.ChangeCents),
			Reference:     p.Reference,
		})
	}

	return out
}

func centsPtrToInt64Ptr(c *dto.Cents) *int64 {
	if c == nil {
		return nil
	}
	v := c.Int64()
	return &v
}

// branchIDOrNil converts the token's branch claim, which is uuid.Nil for a user
// whose role applies business-wide, into the nullable column value.
func branchIDOrNil(c *fiber.Ctx) *uuid.UUID {
	branchID := middleware.BranchID(c)
	if branchID == uuid.Nil {
		return nil
	}
	return &branchID
}
