package dto

import "github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"

// Order sync bodies are snake_case, matching the frontend's PendingOrder and
// CartItem types verbatim — the till serialises its IndexedDB rows and posts
// them as-is, so any field rename here silently drops data.
//
// Money is integer cents throughout. Timestamps are epoch milliseconds, because
// that is what the client stores (Date.now()).

// SyncOrdersRequest is the POST /orders/sync body: {"orders": [...]}.
//
// The batch is capped rather than unbounded. The client sends at most 50 per
// cycle (SYNC_CONFIG.maxBatchSize), so a larger batch means a misbehaving or
// hostile caller, and each order carries its own line items.
type SyncOrdersRequest struct {
	Orders []SyncOrderInput `json:"orders" validate:"required,min=1,max=50,dive"`
}

type SyncOrderInput struct {
	// The till's UUID for this sale, and the idempotency key. Required: without
	// it a replay cannot be recognised and the sale would be double-counted.
	ClientGeneratedID string `json:"client_generated_id" validate:"required,max=64"`
	ReceiptNo         string `json:"receipt_no" validate:"omitempty,max=64"`

	Items    []SyncOrderItemInput    `json:"items" validate:"required,min=1,dive"`
	Payments []SyncOrderPaymentInput `json:"payments" validate:"omitempty,dive"`

	// Cents, not int64: the client can send a fractional amount for weighted
	// items. See the type's doc comment — rejecting those would fail the whole
	// batch and strand sales that already happened.
	TotalCents    Cents `json:"total_cents" validate:"min=0"`
	TaxTotalCents Cents `json:"tax_total_cents" validate:"min=0"`
	DiscountCents Cents `json:"discount_cents" validate:"min=0"`

	PaymentMethod string `json:"payment_method" validate:"required,oneof=cash card qr other"`

	// Epoch milliseconds, from the till's clock. Preserved as the sale's
	// business date: an order that syncs days late must not be booked today.
	CreatedAt int64 `json:"created_at" validate:"required"`

	CashierID string `json:"cashier_id" validate:"omitempty,uuid"`

	// Accepted and ignored: the client annotates refunds locally and there is no
	// refund endpoint yet, so honouring this would record a reversal the server
	// cannot otherwise explain.
	Refunded bool `json:"refunded"`
}

type SyncOrderItemInput struct {
	ProductID      string  `json:"product_id" validate:"omitempty,uuid"`
	Name           string  `json:"name" validate:"required,max=255"`
	Quantity       float64 `json:"quantity" validate:"required"`
	UnitPriceCents Cents   `json:"unit_price_cents" validate:"min=0"`
	TaxRate        float64 `json:"tax_rate" validate:"min=0"`
	Unit           string  `json:"unit" validate:"omitempty,max=16"`
	IsWeighted     bool    `json:"is_weighted"`
	// Per-line override, applied before any cart-level discount.
	LineDiscountCents Cents `json:"line_discount_cents" validate:"min=0"`
}

type SyncOrderPaymentInput struct {
	Method      string `json:"method" validate:"required,oneof=cash card qr other"`
	AmountCents Cents  `json:"amount_cents"`
	// Cash only.
	TenderedCents *Cents `json:"tendered_cents"`
	ChangeCents   *Cents `json:"change_cents"`
	// Card auth code / QR transaction id.
	Reference string `json:"reference" validate:"omitempty,max=128"`
}

// SyncOrderOutcome.Result carries one of four strings, matched by the client
// (mapSyncResultToStatus in pos-frontend/src/lib/sync/index.ts), so they are
// part of the contract:
//
//	synced         - stored now
//	already_synced - a previous push already stored it; also terminal success
//	conflict       - rejected permanently, NEVER retried by the client
//	error          - transient; the client retries on a later cycle
//
// "conflict" strands the sale in the local database with no further attempt, so
// it is reserved for a payload that can never succeed however often it is
// resent. Anything that might work later must be "error".
//
// The values themselves live on service.SyncOrderResult, which is what the
// service produces and the handler stringifies; a duplicate set of constants
// here was never referenced.
type SyncOrderOutcome struct {
	ClientGeneratedID string `json:"client_generated_id"`
	Result            string `json:"result"`
	ServerID          string `json:"server_id,omitempty"`
}

// SyncOrdersResponse must carry exactly one outcome per submitted order,
// including the ones that failed.
//
// An order the client sent but finds missing from results stays "syncing"
// locally forever — nothing re-queues it, and only a page reload recovers it
// (releaseOrphanedClaims on startup). That is a real data-loss path, so the
// handler reports an outcome for every order even when handling one panics or
// errors partway through the batch.
type SyncOrdersResponse struct {
	Results []SyncOrderOutcome `json:"results"`
}

// ── Reading sales back ─────────────────────────────────────────────────────

// OrderListQuery is the GET /orders query string.
//
// Paginated, unlike GET /products. The catalogue is bounded and the till caches
// all of it to sell offline; order history only grows, and no screen needs more
// than a page of it at a time.
//
// from/to are epoch milliseconds to match created_at on the wire elsewhere, and
// they bound sold_at — the business date the sale was rung up on, not the time
// the server received it. A sale pushed up three days late belongs in the day it
// happened.
type OrderListQuery struct {
	PaginationQuery

	PaymentMethod string `query:"payment_method" validate:"omitempty,oneof=cash card qr other"`
	From          int64  `query:"from" validate:"omitempty,min=0"`
	To            int64  `query:"to" validate:"omitempty,min=0"`
}

// OrderSortFields is the whitelist pagination.Parse validates against. GORM does
// not escape ORDER BY, so an unlisted field is rejected rather than
// interpolated. First entry is the default: newest sale first.
var OrderSortFields = []string{"sold_at", "total_cents", "synced_at", "created_at"}

type OrderItemResponse struct {
	ProductID *string `json:"product_id"`
	Name      string  `json:"name"`
	Quantity  float64 `json:"quantity"`
	// Captured at sale time, not joined from the catalogue: a receipt must
	// reprint as it was rung up even after the price changes.
	UnitPriceCents    int64   `json:"unit_price_cents"`
	TaxRate           float64 `json:"tax_rate"`
	Unit              *string `json:"unit,omitempty"`
	IsWeighted        bool    `json:"is_weighted,omitempty"`
	LineDiscountCents int64   `json:"line_discount_cents"`
}

type OrderPaymentResponse struct {
	Method        string  `json:"method"`
	AmountCents   int64   `json:"amount_cents"`
	TenderedCents *int64  `json:"tendered_cents,omitempty"`
	ChangeCents   *int64  `json:"change_cents,omitempty"`
	Reference     *string `json:"reference,omitempty"`
}

// OrderResponse is a stored sale as the sales screen reads it back.
//
// client_generated_id is present and is the field the client keys on, not id:
// the till already holds the same sale under that key in IndexedDB, and the
// sales screen overlays its unsynced local rows on top of this list. Keying on
// the server id would show the same sale twice.
//
// Timestamps are epoch milliseconds, matching every other domain payload.
type OrderResponse struct {
	ID                string  `json:"id"`
	ClientGeneratedID string  `json:"client_generated_id"`
	ReceiptNo         *string `json:"receipt_no"`
	PaymentMethod     string  `json:"payment_method"`

	SubtotalCents int64 `json:"subtotal_cents"`
	DiscountCents int64 `json:"discount_cents"`
	TaxTotalCents int64 `json:"tax_total_cents"`
	TotalCents    int64 `json:"total_cents"`
	Refunded      bool  `json:"refunded"`

	// Set when the server's independent recompute disagreed with the till's
	// figures. The sale is stored either way — see entity.Order — so this is a
	// review flag, not a rejection, and the screen surfaces it as one.
	TotalsMismatch      bool   `json:"totals_mismatch"`
	ServerTotalCents    *int64 `json:"server_total_cents,omitempty"`
	ServerTaxTotalCents *int64 `json:"server_tax_total_cents,omitempty"`

	CashierID *string `json:"cashier_id,omitempty"`
	BranchID  *string `json:"branch_id,omitempty"`

	SoldAt   int64 `json:"sold_at"`
	SyncedAt int64 `json:"synced_at"`

	Items    []OrderItemResponse    `json:"items"`
	Payments []OrderPaymentResponse `json:"payments"`
}

// OrderListResponse pairs the page with its metadata as siblings, so the array
// keeps its own key rather than being wrapped in a generic envelope the rest of
// the API does not use.
type OrderListResponse struct {
	Orders []OrderResponse `json:"orders"`
	Meta   response.Meta   `json:"meta"`
}
