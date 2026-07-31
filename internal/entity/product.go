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

// Merchandising group, driving the storage/expiry defaults a grocer expects.
const (
	ProductTypeRegular      = "regular"
	ProductTypeFreshProduce = "fresh_produce"
	ProductTypeFrozen       = "frozen"
	ProductTypeDairy        = "dairy"
	ProductTypeBakery       = "bakery"
	ProductTypeBeverage     = "beverage"
	ProductTypeMeat         = "meat"
	ProductTypeSeafood      = "seafood"
	ProductTypeHousehold    = "household"
	ProductTypePersonalCare = "personal_care"
)

const (
	StorageTypeAmbient = "ambient"
	StorageTypeChilled = "chilled"
	StorageTypeFrozen  = "frozen"
)

// Product is a catalogue row.
//
// Money fields are integer cents (int64), never floats. TaxRate and
// DiscountPercent are the exceptions: rates, not currency — TaxRate is
// fractional (0.08 = 8%) and DiscountPercent is 0-100. Quantities are float64
// because weighted items priced per kg carry fractional stock.
type Product struct {
	IDMixin
	Timestamps
	SoftDelete

	BusinessID uuid.UUID `gorm:"column:business_id;not null"`
	Name       string    `gorm:"column:name;not null"`
	SKU        string    `gorm:"column:sku;not null"`
	Barcode    string    `gorm:"column:barcode;not null"`

	BarcodeSource string `gorm:"column:barcode_source;not null"`

	PriceCents         int64   `gorm:"column:price_cents;not null"`
	CostCents          *int64  `gorm:"column:cost_cents"`
	PurchasePriceCents *int64  `gorm:"column:purchase_price_cents"`
	TaxRate            float64 `gorm:"column:tax_rate;not null"`
	StockQuantity      float64 `gorm:"column:stock_quantity;not null"`

	Category    *string `gorm:"column:category"`
	Subcategory *string `gorm:"column:subcategory"`
	Brand       *string `gorm:"column:brand"`
	Description *string `gorm:"column:description"`
	Unit        string  `gorm:"column:unit;not null"`
	Status      string  `gorm:"column:status;not null"`
	ProductType string  `gorm:"column:product_type;not null"`
	StorageType string  `gorm:"column:storage_type;not null"`

	IsWeighted       bool `gorm:"column:is_weighted;not null"`
	IsVariableWeight bool `gorm:"column:is_variable_weight;not null"`
	AllowDiscount    bool `gorm:"column:allow_discount;not null"`
	AllowReturns     bool `gorm:"column:allow_returns;not null"`
	TrackExpiry      bool `gorm:"column:track_expiry;not null"`
	TrackBatch       bool `gorm:"column:track_batch;not null"`

	// ReorderLevel triggers the low-stock alert; MinStockLevel is the hard
	// floor. Distinct thresholds, deliberately separate fields.
	ReorderLevel    *float64 `gorm:"column:reorder_level"`
	MinStockLevel   *float64 `gorm:"column:min_stock_level"`
	DiscountPercent float64  `gorm:"column:discount_percent;not null"`

	ProductCode         *string `gorm:"column:product_code"`
	QRCode              *string `gorm:"column:qr_code"`
	ShelfLocation       *string `gorm:"column:shelf_location"`
	Branch              *string `gorm:"column:branch"`
	SupplierProductCode *string `gorm:"column:supplier_product_code"`
	ImageURL            *string `gorm:"column:image_url"`

	// Images is an ordered list of data URLs; PluginData is opaque key/value
	// owned by the active business-type plugin. Neither is queried by content.
	Images     datatypes.JSON `gorm:"column:images;not null;default:'[]'"`
	PluginData datatypes.JSON `gorm:"column:plugin_data;not null;default:'{}'"`

	// No foreign keys until the Phase 2 suppliers/warehouses tables exist.
	SupplierID  *uuid.UUID `gorm:"column:supplier_id"`
	WarehouseID *uuid.UUID `gorm:"column:warehouse_id"`

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
