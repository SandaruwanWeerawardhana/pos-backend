package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
)

type OrderHandler struct {
	sync service.OrderSyncService
}

func NewOrderHandler(sync service.OrderSyncService) *OrderHandler {
	return &OrderHandler{sync: sync}
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
	inputs := make([]service.SyncOrderInput, 0, len(req.Orders))
	for _, order := range req.Orders {
		inputs = append(inputs, toSyncOrderInput(order))
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
