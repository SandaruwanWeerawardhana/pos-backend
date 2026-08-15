package dto

// Domain models are snake_case (unlike the camelCase /auth bodies), matching
// the frontend's Product type in pos-frontend/src/lib/types/index.ts field for
// field.
//
// Money is integer cents. TaxRate is a fraction (0.08 = 8%) and
// DiscountPercent is 0-100 — both rates, not currency, so neither is in cents.
//
// Optional fields use pointers with omitempty so an absent value is absent from
// the JSON rather than being sent as 0/"" — the client treats a missing
// catalogue field as "fall back to a default", which a zero value would defeat.

type ProductBatchResponse struct {
	BatchNo string `json:"batch_no"`
	// ISO yyyy-mm-dd, or null when the batch is not perishable. A calendar day,
	// so deliberately not an epoch timestamp.
	ExpiryDate       *string `json:"expiry_date"`
	ManufacturedDate *string `json:"manufactured_date,omitempty"`
	Quantity         float64 `json:"quantity"`
	CostCents        *int64  `json:"cost_cents,omitempty"`
}

type ProductResponse struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	SKU     string `json:"sku"`
	Barcode string `json:"barcode"`
	// "package" = GTIN printed by the supplier, "generated" = in-store code.
	BarcodeSource string `json:"barcode_source,omitempty"`

	PriceCents    int64   `json:"price_cents"`
	TaxRate       float64 `json:"tax_rate"`
	StockQuantity float64 `json:"stock_quantity"`
	CostCents     *int64  `json:"cost_cents,omitempty"`

	Category    *string `json:"category,omitempty"`
	Brand       *string `json:"brand,omitempty"`
	Description *string `json:"description,omitempty"`
	Unit        string  `json:"unit,omitempty"`
	Status      string  `json:"status,omitempty"`

	IsWeighted bool `json:"is_weighted,omitempty"`

	ReorderLevel    *float64 `json:"reorder_level,omitempty"`
	MinStockLevel   *float64 `json:"min_stock_level,omitempty"`
	DiscountPercent float64  `json:"discount_percent,omitempty"`

	ShelfLocation *string  `json:"shelf_location,omitempty"`
	ImageURL      *string  `json:"image_url,omitempty"`
	Images        []string `json:"images,omitempty"`

	SupplierID *string `json:"supplier_id,omitempty"`

	// Values for the active business-type plugin's declared fields, keyed by
	// PluginField.key. Opaque to the core app on both sides.
	PluginData map[string]any `json:"plugin_data,omitempty"`

	Batches []ProductBatchResponse `json:"batches,omitempty"`

	// Epoch milliseconds, not RFC3339: the client stores and compares these as
	// numbers throughout (Date.now() arithmetic), so a string would have to be
	// parsed at every use.
	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

// ProductCreateRequest is the POST /products body.
//
// The client generates the id (a UUID) before the row leaves IndexedDB, so the
// same id identifies the product on the till and on the server. That makes the
// push idempotent the same way client_generated_id does for orders: a replay
// after a dropped response collides on the primary key and is reported as an
// existing product rather than inserting a duplicate.
//
// Field names and units mirror ProductResponse so a row can round-trip without
// a translation table.
type ProductCreateRequest struct {
	ID string `json:"id" validate:"required,uuid"`

	Name    string `json:"name" validate:"required,min=2,max=120"`
	SKU     string `json:"sku" validate:"required,min=2,max=48"`
	Barcode string `json:"barcode" validate:"required,min=6,max=32"`
	// Defaults to "package" when absent, matching the column default.
	BarcodeSource string `json:"barcode_source" validate:"omitempty,oneof=package generated"`

	// Cents, not int64, for the same reason as the order DTOs: the client can
	// send a fractional value for a weighed item's price and rejecting it would
	// fail a save the cashier has already completed on screen.
	PriceCents Cents  `json:"price_cents" validate:"min=0"`
	CostCents  *Cents `json:"cost_cents"`
	// Fractional rate (0.08 = 8%), not a percentage and not cents.
	TaxRate       float64 `json:"tax_rate" validate:"min=0"`
	StockQuantity float64 `json:"stock_quantity" validate:"min=0"`

	Category    *string `json:"category" validate:"omitempty,max=60"`
	Brand       *string `json:"brand" validate:"omitempty,max=60"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	Unit        string  `json:"unit" validate:"omitempty,oneof=unit kg g l ml pack box"`
	Status      string  `json:"status" validate:"omitempty,oneof=active inactive draft"`

	IsWeighted bool `json:"is_weighted"`

	ReorderLevel  *float64 `json:"reorder_level" validate:"omitempty,min=0"`
	MinStockLevel *float64 `json:"min_stock_level" validate:"omitempty,min=0"`
	// 0-100, a percentage rather than a fraction — matches the column's CHECK.
	DiscountPercent float64 `json:"discount_percent" validate:"min=0,max=100"`

	ShelfLocation *string `json:"shelf_location" validate:"omitempty,max=40"`
	ImageURL      *string `json:"image_url"`
	// Data URLs. Capped at the client's MAX_IMAGES so one product cannot push an
	// unbounded body through a JSONB column.
	Images []string `json:"images" validate:"omitempty,max=6"`

	SupplierID *string `json:"supplier_id" validate:"omitempty,uuid"`

	PluginData map[string]any `json:"plugin_data"`

	Batches []ProductBatchInput `json:"batches" validate:"omitempty,max=1,dive"`
}

// ProductUpdateRequest is the PUT /products/{id} body: a full replacement of a
// product's catalogue fields, not a sparse patch.
//
// Replace rather than patch because the till edits from a complete local copy
// of the row — it has every field to hand and its form submits all of them at
// once. A PATCH would have to tell "field absent" apart from "field set to
// null" to let the operator clear a brand or a shelf location, which JSON
// pointers alone cannot express; replacement makes an omitted optional field
// unambiguously mean "cleared".
//
// Two things are deliberately NOT replaceable:
//
//   - stock_quantity — owned by the server. Order sync deducts it as sales
//     arrive, so honouring a figure from a till that has been editing a form
//     for five minutes would resurrect a stale count and silently un-sell
//     goods. Stock moves through /orders/sync, and through the Phase 2
//     adjustments endpoint.
//   - batches — goods-receiving, not catalogue editing. An opening batch is
//     written at creation; changing one afterwards is a stock movement.
type ProductUpdateRequest struct {
	Name    string `json:"name" validate:"required,min=2,max=120"`
	SKU     string `json:"sku" validate:"required,min=2,max=48"`
	Barcode string `json:"barcode" validate:"required,min=6,max=32"`
	// Defaults to "package" when absent, matching the column default.
	BarcodeSource string `json:"barcode_source" validate:"omitempty,oneof=package generated"`

	PriceCents Cents   `json:"price_cents" validate:"min=0"`
	CostCents  *Cents  `json:"cost_cents"`
	TaxRate    float64 `json:"tax_rate" validate:"min=0"`

	Category    *string `json:"category" validate:"omitempty,max=60"`
	Brand       *string `json:"brand" validate:"omitempty,max=60"`
	Description *string `json:"description" validate:"omitempty,max=1000"`
	Unit        string  `json:"unit" validate:"omitempty,oneof=unit kg g l ml pack box"`
	Status      string  `json:"status" validate:"omitempty,oneof=active inactive draft"`

	IsWeighted bool `json:"is_weighted"`

	ReorderLevel    *float64 `json:"reorder_level" validate:"omitempty,min=0"`
	MinStockLevel   *float64 `json:"min_stock_level" validate:"omitempty,min=0"`
	DiscountPercent float64  `json:"discount_percent" validate:"min=0,max=100"`

	ShelfLocation *string  `json:"shelf_location" validate:"omitempty,max=40"`
	ImageURL      *string  `json:"image_url"`
	Images        []string `json:"images" validate:"omitempty,max=6"`

	SupplierID *string `json:"supplier_id" validate:"omitempty,uuid"`

	PluginData map[string]any `json:"plugin_data"`
}

// ProductBatchInput is the opening batch a perishable product is created with.
// Dates are calendar days (yyyy-mm-dd), not epoch millis, matching
// ProductBatchResponse.
type ProductBatchInput struct {
	BatchNo          string  `json:"batch_no" validate:"required,max=40"`
	ExpiryDate       *string `json:"expiry_date" validate:"omitempty,datetime=2006-01-02"`
	ManufacturedDate *string `json:"manufactured_date" validate:"omitempty,datetime=2006-01-02"`
	Quantity         float64 `json:"quantity" validate:"min=0"`
	CostCents        *Cents  `json:"cost_cents"`
}
