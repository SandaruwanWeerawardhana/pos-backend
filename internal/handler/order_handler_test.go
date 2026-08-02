package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/middleware"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/service"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/ctxkey"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/pagination"
)

/*
captureSyncService records what the handler hands the service and replies
with one outcome per input, which is the service's own contract.
*/
type captureSyncService struct {
	got []service.SyncOrderInput
}

func (s *captureSyncService) Sync(
	_ context.Context,
	_ uuid.UUID,
	_ *uuid.UUID,
	orders []service.SyncOrderInput,
) []service.SyncOutcome {
	s.got = orders

	outcomes := make([]service.SyncOutcome, 0, len(orders))
	for _, in := range orders {
		outcomes = append(outcomes, service.SyncOutcome{
			ClientGeneratedID: in.ClientGeneratedID,
			Result:            service.ResultSynced,
			ServerID:          uuid.NewString(),
		})
	}
	return outcomes
}

/*
stubOrderService satisfies the read half of the handler's dependencies. These
tests exercise the write path only, so every method fails loudly if reached.
*/
type stubOrderService struct{ t *testing.T }

func (s stubOrderService) List(context.Context, uuid.UUID, service.OrderListQuery) (service.OrderPage, error) {
	s.t.Fatal("List called from a sync test")
	return service.OrderPage{}, nil
}

func (s stubOrderService) GetByClientID(context.Context, uuid.UUID, string) (*entity.Order, error) {
	s.t.Fatal("GetByClientID called from a sync test")
	return nil, nil
}

/*
captureOrderService records the query the handler derived from the URL, which
is where clamping and whitelist validation actually happen.
*/
type captureOrderService struct {
	got  service.OrderListQuery
	page service.OrderPage
	err  error
}

func (s *captureOrderService) List(
	_ context.Context, _ uuid.UUID, query service.OrderListQuery,
) (service.OrderPage, error) {
	s.got = query
	return s.page, s.err
}

func (s *captureOrderService) GetByClientID(
	context.Context, uuid.UUID, string,
) (*entity.Order, error) {
	return nil, nil
}

/*
newSyncApp wires the handler behind a stand-in for the auth middleware, which
is the only thing that puts the token's user/business ids on the context.
*/
func newSyncApp(t *testing.T, sync service.OrderSyncService, userID, businessID uuid.UUID) *fiber.App {
	t.Helper()

	app := fiber.New()
	app.Post("/orders/sync", func(c *fiber.Ctx) error {
		c.Locals(ctxkey.UserID, userID)
		c.Locals(ctxkey.BusinessID, businessID)
		return NewOrderHandler(sync, stubOrderService{t: t}).Sync(c)
	})
	return app
}

func postSync(t *testing.T, app *fiber.App, body string) *http.Response {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/orders/sync", strings.NewReader(body))
	req.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)

	res, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	return res
}

const oneOrderTemplate = `{"orders":[{
	"client_generated_id":"cgid-1",
	"payment_method":"cash",
	"created_at":1735689600000,
	"total_cents":398,
	"tax_total_cents":0,
	"discount_cents":0,
	%s
	"items":[{"name":"Bananas","quantity":2,"unit_price_cents":199,"tax_rate":0}]
}]}`

/*
A sale that names no cashier is still attributable: the request carried a
token, and that user rang it up. Leaving CashierID nil dropped the order out
of every per-cashier report.
*/
func TestSyncFallsBackToTheAuthenticatedCashier(t *testing.T) {
	userID := uuid.New()
	sync := &captureSyncService{}
	app := newSyncApp(t, sync, userID, uuid.New())

	res := postSync(t, app, fmt.Sprintf(oneOrderTemplate, ""))

	if res.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, fiber.StatusOK)
	}
	if len(sync.got) != 1 {
		t.Fatalf("service received %d orders, want 1", len(sync.got))
	}
	if sync.got[0].CashierID == nil {
		t.Fatal("CashierID = nil, want the token's user id")
	}
	if *sync.got[0].CashierID != userID {
		t.Errorf("CashierID = %s, want %s", sync.got[0].CashierID, userID)
	}
}

/*
An explicit cashier_id wins. Phase 2 staff/PIN auth rings sales up under the
staff member rather than the device's token holder, so the handler must not
overwrite what the client sent.
*/
func TestSyncKeepsAnExplicitCashierID(t *testing.T) {
	tokenUserID := uuid.New()
	staffID := uuid.New()
	sync := &captureSyncService{}
	app := newSyncApp(t, sync, tokenUserID, uuid.New())

	res := postSync(t, app, fmt.Sprintf(
		oneOrderTemplate,
		fmt.Sprintf(`"cashier_id":"%s",`, staffID),
	))

	if res.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, fiber.StatusOK)
	}
	if sync.got[0].CashierID == nil || *sync.got[0].CashierID != staffID {
		t.Errorf("CashierID = %v, want %s", sync.got[0].CashierID, staffID)
	}
}

/*
One result per submitted order, always — a client that does not find its
order in results leaves it "syncing" locally with nothing to re-queue it.
*/
func TestSyncReturnsOneResultPerOrder(t *testing.T) {
	sync := &captureSyncService{}
	app := newSyncApp(t, sync, uuid.New(), uuid.New())

	res := postSync(t, app, fmt.Sprintf(oneOrderTemplate, ""))

	var body dto.SyncOrdersResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Results) != 1 {
		t.Fatalf("results = %d, want 1", len(body.Results))
	}
	if body.Results[0].ClientGeneratedID != "cgid-1" {
		t.Errorf("client_generated_id = %q, want %q", body.Results[0].ClientGeneratedID, "cgid-1")
	}
	if body.Results[0].Result != "synced" {
		t.Errorf("result = %q, want %q", body.Results[0].Result, "synced")
	}
}

/*
	── GET /orders ────────────────────────────────────────────────────────────
*/

/*
newListApp mirrors newSyncApp for the read path, including the error handler:
a rejected sort or an inverted date range has to come back as a status code,
not a panic.
*/
func newListApp(orders service.OrderService, businessID uuid.UUID) *fiber.App {
	/*
		A real logger, not nil: ErrorHandler logs every rejection, and these tests
		exist precisely to drive it down the rejection paths.
	*/
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	app := fiber.New(fiber.Config{ErrorHandler: middleware.ErrorHandler(logger)})
	h := NewOrderHandler(nil, orders)
	app.Get("/orders", func(c *fiber.Ctx) error {
		c.Locals(ctxkey.BusinessID, businessID)
		return h.List(c)
	})
	return app
}

func getOrders(t *testing.T, app *fiber.App, query string) *http.Response {
	t.Helper()

	res, err := app.Test(httptest.NewRequest(http.MethodGet, "/orders"+query, nil), -1)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	return res
}

/*
No query string must still produce a bounded, deterministically ordered page —
an unpaginated default would grow into a full table scan as sales accumulate.
*/
func TestListAppliesPaginationDefaults(t *testing.T) {
	orders := &captureOrderService{}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "")

	if res.StatusCode != fiber.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, fiber.StatusOK)
	}
	if orders.got.Limit != pagination.DefaultPerPage {
		t.Errorf("Limit = %d, want %d", orders.got.Limit, pagination.DefaultPerPage)
	}
	if orders.got.Offset != 0 {
		t.Errorf("Offset = %d, want 0", orders.got.Offset)
	}
	if orders.got.Sort != "sold_at" || orders.got.Order != "desc" {
		t.Errorf("sort = %q %q, want sold_at desc", orders.got.Sort, orders.got.Order)
	}
}

/*
per_page is clamped rather than honoured: an unbounded page is a denial of
service against a table that only grows.
*/
func TestListClampsPerPage(t *testing.T) {
	orders := &captureOrderService{}
	app := newListApp(orders, uuid.New())

	getOrders(t, app, "?per_page=5000&page=3")

	if orders.got.Limit != pagination.MaxPerPage {
		t.Errorf("Limit = %d, want %d", orders.got.Limit, pagination.MaxPerPage)
	}
	if want := 2 * pagination.MaxPerPage; orders.got.Offset != want {
		t.Errorf("Offset = %d, want %d", orders.got.Offset, want)
	}
}

/*
Sort is interpolated into ORDER BY, which GORM does not escape. An unlisted
value must be rejected outright, never passed through or silently ignored.
*/
func TestListRejectsAnUnlistedSortField(t *testing.T) {
	orders := &captureOrderService{}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "?sort=total_cents;DROP+TABLE+orders")

	if res.StatusCode != fiber.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", res.StatusCode, fiber.StatusUnprocessableEntity)
	}
	if orders.got.Sort != "" {
		t.Errorf("service was called with sort = %q; it should not have been called", orders.got.Sort)
	}
}

func TestListRejectsAnInvertedDateRange(t *testing.T) {
	orders := &captureOrderService{}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "?from=1735689600000&to=1704067200000")

	if res.StatusCode != fiber.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", res.StatusCode, fiber.StatusUnprocessableEntity)
	}
}

func TestListRejectsAnUnknownPaymentMethod(t *testing.T) {
	orders := &captureOrderService{}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "?payment_method=bitcoin")

	if res.StatusCode != fiber.StatusUnprocessableEntity {
		t.Errorf("status = %d, want %d", res.StatusCode, fiber.StatusUnprocessableEntity)
	}
}

/*
Meta describes the whole filtered result, not the page — the client renders
"1–20 of 45" and enables its next-page control from it.
*/
func TestListReturnsOrdersWithPaginationMeta(t *testing.T) {
	soldAt := time.UnixMilli(1735689600000)
	orders := &captureOrderService{
		page: service.OrderPage{
			Total: 45,
			Orders: []entity.Order{{
				ClientGeneratedID: "cgid-1",
				PaymentMethod:     "cash",
				TotalCents:        398,
				SoldAt:            soldAt,
				Items: []entity.OrderItem{
					{Name: "Bananas", Quantity: 2, UnitPriceCents: 199},
				},
			}},
		},
	}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "")

	var body dto.OrderListResponse
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Orders) != 1 {
		t.Fatalf("orders = %d, want 1", len(body.Orders))
	}
	if body.Orders[0].ClientGeneratedID != "cgid-1" {
		t.Errorf("client_generated_id = %q, want cgid-1", body.Orders[0].ClientGeneratedID)
	}
	if body.Orders[0].SoldAt != soldAt.UnixMilli() {
		t.Errorf("sold_at = %d, want %d", body.Orders[0].SoldAt, soldAt.UnixMilli())
	}
	if len(body.Orders[0].Items) != 1 {
		t.Errorf("items = %d, want 1", len(body.Orders[0].Items))
	}
	if body.Meta.Total != 45 || body.Meta.TotalPages != 3 || !body.Meta.HasNext {
		t.Errorf("meta = %+v, want total 45 / 3 pages / has_next", body.Meta)
	}
}

/*
An order with no lines must serialise as [], not null: the client calls
.length and .map() on both arrays without a guard.
*/
func TestListSerialisesEmptyItemsAsAnArray(t *testing.T) {
	orders := &captureOrderService{
		page: service.OrderPage{Total: 1, Orders: []entity.Order{{ClientGeneratedID: "cgid-1"}}},
	}
	app := newListApp(orders, uuid.New())

	res := getOrders(t, app, "")

	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if !strings.Contains(string(raw), `"items":[]`) {
		t.Errorf("items did not serialise as an empty array: %s", raw)
	}
	if !strings.Contains(string(raw), `"payments":[]`) {
		t.Errorf("payments did not serialise as an empty array: %s", raw)
	}
}
