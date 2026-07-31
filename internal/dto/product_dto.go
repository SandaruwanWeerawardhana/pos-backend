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

	PriceCents         int64   `json:"price_cents"`
	TaxRate            float64 `json:"tax_rate"`
	StockQuantity      float64 `json:"stock_quantity"`
	CostCents          *int64  `json:"cost_cents,omitempty"`
	PurchasePriceCents *int64  `json:"purchase_price_cents,omitempty"`

	Category    *string `json:"category,omitempty"`
	Subcategory *string `json:"subcategory,omitempty"`
	Brand       *string `json:"brand,omitempty"`
	Description *string `json:"description,omitempty"`
	Unit        string  `json:"unit,omitempty"`
	Status      string  `json:"status,omitempty"`
	ProductType string  `json:"product_type,omitempty"`
	StorageType string  `json:"storage_type,omitempty"`

	IsWeighted       bool `json:"is_weighted,omitempty"`
	IsVariableWeight bool `json:"is_variable_weight,omitempty"`
	AllowDiscount    bool `json:"allow_discount,omitempty"`
	AllowReturns     bool `json:"allow_returns,omitempty"`
	TrackExpiry      bool `json:"track_expiry,omitempty"`
	TrackBatch       bool `json:"track_batch,omitempty"`

	ReorderLevel    *float64 `json:"reorder_level,omitempty"`
	MinStockLevel   *float64 `json:"min_stock_level,omitempty"`
	DiscountPercent float64  `json:"discount_percent,omitempty"`

	ProductCode         *string  `json:"product_code,omitempty"`
	QRCode              *string  `json:"qr_code,omitempty"`
	ShelfLocation       *string  `json:"shelf_location,omitempty"`
	Branch              *string  `json:"branch,omitempty"`
	SupplierProductCode *string  `json:"supplier_product_code,omitempty"`
	ImageURL            *string  `json:"image_url,omitempty"`
	Images              []string `json:"images,omitempty"`

	SupplierID  *string `json:"supplier_id,omitempty"`
	WarehouseID *string `json:"warehouse_id,omitempty"`

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
