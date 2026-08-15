package entity

import (
	"time"

	"github.com/google/uuid"
)

const (
	PaymentMethodCash  = "cash"
	PaymentMethodCard  = "card"
	PaymentMethodQR    = "qr"
	PaymentMethodOther = "other"
)

/*
Order is a completed sale pushed up from the offline-first till.

ClientGeneratedID is the till's own UUID for the sale and is unique per
business. That constraint is what makes order sync idempotent: a replayed
batch collides on insert and resolves to "already_synced" rather than
duplicating revenue and deducting stock twice.
*/
type Order struct {
	IDMixin
	Timestamps
	SoftDelete

	BusinessID        uuid.UUID  `gorm:"column:business_id;not null"`
	BranchID          *uuid.UUID `gorm:"column:branch_id"`
	ClientGeneratedID string     `gorm:"column:client_generated_id;not null"`
	ReceiptNo         *string    `gorm:"column:receipt_no"`
	PaymentMethod     string     `gorm:"column:payment_method;not null"`

	SubtotalCents int64 `gorm:"column:subtotal_cents;not null"`
	DiscountCents int64 `gorm:"column:discount_cents;not null"`
	TaxTotalCents int64 `gorm:"column:tax_total_cents;not null"`
	TotalCents    int64 `gorm:"column:total_cents;not null"`
	Refunded      bool  `gorm:"column:refunded;not null"`

	/*
		The till's figures above are stored verbatim — the customer holds a
		receipt showing them. The server recomputes anyway and records a
		disagreement here instead of rejecting the sale: the client never retries
		a "conflict", so failing an order over a rounding difference would strand
		real revenue. Server* are nil when they agree, so a row carrying values
		is by itself the review queue.
	*/
	TotalsMismatch      bool   `gorm:"column:totals_mismatch;not null"`
	ServerTotalCents    *int64 `gorm:"column:server_total_cents"`
	ServerTaxTotalCents *int64 `gorm:"column:server_tax_total_cents"`

	CashierID *uuid.UUID `gorm:"column:cashier_id"`
	/*
		SoldAt comes off the client, never now(): an order that syncs days late
		must keep the business date it was rung up on.
	*/
	SoldAt   time.Time `gorm:"column:sold_at;not null"`
	SyncedAt time.Time `gorm:"column:synced_at;not null"`

	Items    []OrderItem    `gorm:"foreignKey:OrderID;references:ID"`
	Payments []OrderPayment `gorm:"foreignKey:OrderID;references:ID"`
}

func (Order) TableName() string { return "orders" }

/*
OrderItem is one sold line. Name, UnitPriceCents, and TaxRate are copies
captured at sale time rather than joins to Product: a receipt must reprint
exactly as it was rung up even after the catalogue price changes, which is
also why ProductID is nullable.
*/
type OrderItem struct {
	IDMixin
	CreatedOnly

	OrderID           uuid.UUID  `gorm:"column:order_id;not null"`
	ProductID         *uuid.UUID `gorm:"column:product_id"`
	Name              string     `gorm:"column:name;not null"`
	Quantity          float64    `gorm:"column:quantity;not null"`
	UnitPriceCents    int64      `gorm:"column:unit_price_cents;not null"`
	TaxRate           float64    `gorm:"column:tax_rate;not null"`
	Unit              *string    `gorm:"column:unit"`
	IsWeighted        bool       `gorm:"column:is_weighted;not null"`
	LineDiscountCents int64      `gorm:"column:line_discount_cents;not null"`
}

func (OrderItem) TableName() string { return "order_items" }

/*
OrderPayment is one tender leg. A single-tender sale has exactly one; a
split sale has several whose AmountCents sum to the order total.
*/
type OrderPayment struct {
	IDMixin
	CreatedOnly

	OrderID       uuid.UUID `gorm:"column:order_id;not null"`
	Method        string    `gorm:"column:method;not null"`
	AmountCents   int64     `gorm:"column:amount_cents;not null"`
	TenderedCents *int64    `gorm:"column:tendered_cents"`
	ChangeCents   *int64    `gorm:"column:change_cents"`
	Reference     *string   `gorm:"column:reference"`
}

func (OrderPayment) TableName() string { return "order_payments" }
