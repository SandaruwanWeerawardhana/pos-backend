package dto

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

// Sync outcomes. These strings are matched by the client
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
const (
	SyncResultSynced        = "synced"
	SyncResultAlreadySynced = "already_synced"
	SyncResultConflict      = "conflict"
	SyncResultError         = "error"
)

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
