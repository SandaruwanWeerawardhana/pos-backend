package entity

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// Barcode provenance: a GTIN printed by the supplier vs. an in-store code the
// shop prints itself.
const (
	BarcodeSourcePackage   = "package"
	BarcodeSourceGenerated = "generated"
)

// Sellability at the till. "draft" rows are saved but hidden from the POS
// product grid.
const (
	ProductStatusActive   = "active"
	ProductStatusInactive = "inactive"
	ProductStatusDraft    = "draft"
)

// How quantity is entered at the till.
const (
	UnitEach = "unit"
	UnitKg   = "kg"
	UnitG    = "g"
	UnitL    = "l"
	UnitMl   = "ml"
	UnitPack = "pack"
	UnitBox  = "box"
)

// Product is a catalogue row.
//
// Money fields are integer cents (int64), never floats. TaxRate and
// DiscountPercent are the exceptions: rates, not currency — TaxRate is
// fractional (0.08 = 8%) and DiscountPercent is 0-100. Quantities are float64
// because weighted items priced per kg carry fractional stock.
//
// The products table still carries columns this struct does not map
// (product_code, qr_code, subcategory, branch, warehouse_id, product_type,
// storage_type, is_variable_weight, allow_discount, allow_returns,
// track_expiry, track_batch, purchase_price_cents, supplier_product_code).
// Nothing on either side of the wire read or wrote them, so they were dropped
// from the model rather than the schema — every one is nullable or defaulted,
// so INSERTs that omit them are accepted as-is. Re-add the field here if a
// feature ever needs one; no migration is required to do so.
type Product struct {
	IDMixin
	Timestamps
	SoftDelete

	BusinessID uuid.UUID `gorm:"column:business_id;not null"`
	Name       string    `gorm:"column:name;not null"`
	SKU        string    `gorm:"column:sku;not null"`
	Barcode    string    `gorm:"column:barcode;not null"`

	BarcodeSource string `gorm:"column:barcode_source;not null"`

	PriceCents    int64   `gorm:"column:price_cents;not null"`
	CostCents     *int64  `gorm:"column:cost_cents"`
	TaxRate       float64 `gorm:"column:tax_rate;not null"`
	StockQuantity float64 `gorm:"column:stock_quantity;not null"`

	Category    *string `gorm:"column:category"`
	Brand       *string `gorm:"column:brand"`
	Description *string `gorm:"column:description"`
	Unit        string  `gorm:"column:unit;not null"`
	Status      string  `gorm:"column:status;not null"`

	IsWeighted bool `gorm:"column:is_weighted;not null"`

	// ReorderLevel triggers the low-stock alert; MinStockLevel is the hard
	// floor. Distinct thresholds, deliberately separate fields.
	ReorderLevel    *float64 `gorm:"column:reorder_level"`
	MinStockLevel   *float64 `gorm:"column:min_stock_level"`
	DiscountPercent float64  `gorm:"column:discount_percent;not null"`

	ShelfLocation *string `gorm:"column:shelf_location"`
	ImageURL      *string `gorm:"column:image_url"`

	// Images is an ordered list of data URLs; PluginData is opaque key/value
	// owned by the active business-type plugin. Neither is queried by content.
	Images     datatypes.JSON `gorm:"column:images;not null;default:'[]'"`
	PluginData datatypes.JSON `gorm:"column:plugin_data;not null;default:'{}'"`

	// No foreign key until the Phase 2 suppliers table exists.
	SupplierID *uuid.UUID `gorm:"column:supplier_id"`

	// Loaded explicitly via Preload: most catalogue reads never touch batches.
	Batches []ProductBatch `gorm:"foreignKey:ProductID;references:ID"`
}

func (Product) TableName() string { return "products" }

// ProductBatch tracks batch/expiry for perishables. Relational rather than
// JSON on Product so the expiry-alert query can filter and sort by ExpiryDate
// across the whole catalogue.
type ProductBatch struct {
	IDMixin
	Timestamps

	ProductID uuid.UUID `gorm:"column:product_id;not null"`
	BatchNo   string    `gorm:"column:batch_no;not null"`
	// Calendar days printed on a label: no time-of-day, no timezone.
	ExpiryDate       *time.Time `gorm:"column:expiry_date;type:date"`
	ManufacturedDate *time.Time `gorm:"column:manufactured_date;type:date"`
	Quantity         float64    `gorm:"column:quantity;not null"`
	CostCents        *int64     `gorm:"column:cost_cents"`
}

func (ProductBatch) TableName() string { return "product_batches" }
