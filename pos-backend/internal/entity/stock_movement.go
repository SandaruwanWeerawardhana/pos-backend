package entity

import "github.com/google/uuid"

/*
Stock movement causes. Phase 1 only writes MovementSale (at order sync);
the rest are reachable once the Phase 2 inventory endpoints land.
*/
const (
	MovementSale        = "sale"
	MovementPurchase    = "purchase"
	MovementAdjustment  = "adjustment"
	MovementTransferIn  = "transfer_in"
	MovementTransferOut = "transfer_out"
	MovementWaste       = "waste"
	MovementDamage      = "damage"
	MovementReturn      = "return"
)

/*
StockMovement is an append-only ledger row explaining one stock change.

ProductName and BalanceAfter are denormalised deliberately: history must
stay readable after a product is renamed or deleted, and recomputing a
running balance by summing deltas gets slower with every sale.

ReferenceID has no foreign key — it points at whichever aggregate caused the
movement (an order in Phase 1, a purchase order or return later), so no
single FK fits.
*/
type StockMovement struct {
	IDMixin
	CreatedOnly

	BusinessID  uuid.UUID  `gorm:"column:business_id;not null"`
	ProductID   *uuid.UUID `gorm:"column:product_id"`
	ProductName string     `gorm:"column:product_name;not null"`
	Type        string     `gorm:"column:type;not null"`

	/*
		Signed: negative removes stock. BalanceAfter is the product's total
		immediately after this movement was applied.
	*/
	QuantityDelta float64 `gorm:"column:quantity_delta;not null"`
	BalanceAfter  float64 `gorm:"column:balance_after;not null"`

	Reason      *string    `gorm:"column:reason"`
	BatchNo     *string    `gorm:"column:batch_no"`
	ReferenceID *uuid.UUID `gorm:"column:reference_id"`
	CreatedBy   *uuid.UUID `gorm:"column:created_by"`
}

func (StockMovement) TableName() string { return "stock_movements" }
