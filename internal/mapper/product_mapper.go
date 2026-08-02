package mapper

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

// ToProductResponse maps a catalogue row onto the wire shape the till caches.
func ToProductResponse(p entity.Product) dto.ProductResponse {
	res := dto.ProductResponse{
		ID:            p.ID.String(),
		Name:          p.Name,
		SKU:           p.SKU,
		Barcode:       p.Barcode,
		BarcodeSource: p.BarcodeSource,

		PriceCents:    p.PriceCents,
		TaxRate:       p.TaxRate,
		StockQuantity: p.StockQuantity,
		CostCents:     p.CostCents,

		Category:    p.Category,
		Brand:       p.Brand,
		Description: p.Description,
		Unit:        p.Unit,
		Status:      p.Status,

		IsWeighted: p.IsWeighted,

		ReorderLevel:    p.ReorderLevel,
		MinStockLevel:   p.MinStockLevel,
		DiscountPercent: p.DiscountPercent,

		ShelfLocation: p.ShelfLocation,
		ImageURL:      p.ImageURL,

		SupplierID: uuidPtrToStringPtr(p.SupplierID),

		Images:     jsonToStringSlice(p.Images),
		PluginData: jsonToMap(p.PluginData),

		CreatedAt: epochMillis(p.CreatedAt),
		UpdatedAt: epochMillis(p.UpdatedAt),
	}

	if len(p.Batches) > 0 {
		res.Batches = make([]dto.ProductBatchResponse, 0, len(p.Batches))
		for _, b := range p.Batches {
			res.Batches = append(res.Batches, dto.ProductBatchResponse{
				BatchNo:          b.BatchNo,
				ExpiryDate:       isoDatePtr(b.ExpiryDate),
				ManufacturedDate: isoDatePtr(b.ManufacturedDate),
				Quantity:         b.Quantity,
				CostCents:        b.CostCents,
			})
		}
	}

	return res
}

// ToProductResponseList always returns a non-nil slice: encoding/json renders a
// nil slice as null, and the client calls .map() on the response directly.
func ToProductResponseList(products []entity.Product) []dto.ProductResponse {
	out := make([]dto.ProductResponse, 0, len(products))
	for _, p := range products {
		out = append(out, ToProductResponse(p))
	}
	return out
}

// ToProductEntity builds the row a POST /products body describes. The id comes
// from the client so the push is idempotent on replay; business_id comes from
// the token, never the body.
//
// Unit and status fall to their schema defaults when absent: an empty string
// here would violate the column's CHECK, so a missing value is left to the
// default rather than written through.
func ToProductEntity(businessID, id uuid.UUID, req dto.ProductCreateRequest) entity.Product {
	p := entity.Product{
		BusinessID: businessID,
		Name:       req.Name,
		SKU:        req.SKU,
		Barcode:    req.Barcode,

		PriceCents:    req.PriceCents.Int64(),
		CostCents:     centsPtrToInt64Ptr(req.CostCents),
		TaxRate:       req.TaxRate,
		StockQuantity: req.StockQuantity,

		Category:    req.Category,
		Brand:       req.Brand,
		Description: req.Description,

		IsWeighted: req.IsWeighted,

		ReorderLevel:    req.ReorderLevel,
		MinStockLevel:   req.MinStockLevel,
		DiscountPercent: req.DiscountPercent,

		ShelfLocation: req.ShelfLocation,
		ImageURL:      req.ImageURL,

		SupplierID: parseUUIDPtr(req.SupplierID),

		Images:     stringSliceToJSON(req.Images),
		PluginData: mapToJSON(req.PluginData),
	}
	p.ID = id

	p.BarcodeSource = req.BarcodeSource
	if p.BarcodeSource == "" {
		p.BarcodeSource = entity.BarcodeSourcePackage
	}
	p.Unit = req.Unit
	if p.Unit == "" {
		p.Unit = entity.UnitEach
	}
	p.Status = req.Status
	if p.Status == "" {
		p.Status = entity.ProductStatusActive
	}

	for _, b := range req.Batches {
		p.Batches = append(p.Batches, entity.ProductBatch{
			ProductID:        id,
			BatchNo:          b.BatchNo,
			ExpiryDate:       parseISODate(b.ExpiryDate),
			ManufacturedDate: parseISODate(b.ManufacturedDate),
			Quantity:         b.Quantity,
			CostCents:        centsPtrToInt64Ptr(b.CostCents),
		})
	}

	return p
}

// ApplyProductUpdate overwrites p's catalogue fields with the request's.
//
// Every mutable field is assigned unconditionally, including the pointers: that
// is what makes an omitted optional field clear the column rather than leave it
// alone, which is the whole point of replacement semantics (see
// dto.ProductUpdateRequest).
//
// Untouched on purpose: ID, BusinessID, StockQuantity, Batches, and the
// timestamps. Stock and batches are owned by order sync and goods-receiving
// respectively, and letting a catalogue edit carry either would let a stale
// client copy overwrite live figures.
func ApplyProductUpdate(p *entity.Product, req dto.ProductUpdateRequest) {
	p.Name = req.Name
	p.SKU = req.SKU
	p.Barcode = req.Barcode

	p.PriceCents = req.PriceCents.Int64()
	p.CostCents = centsPtrToInt64Ptr(req.CostCents)
	p.TaxRate = req.TaxRate

	p.Category = req.Category
	p.Brand = req.Brand
	p.Description = req.Description

	p.IsWeighted = req.IsWeighted

	p.ReorderLevel = req.ReorderLevel
	p.MinStockLevel = req.MinStockLevel
	p.DiscountPercent = req.DiscountPercent

	p.ShelfLocation = req.ShelfLocation
	p.ImageURL = req.ImageURL

	p.SupplierID = parseUUIDPtr(req.SupplierID)

	p.Images = stringSliceToJSON(req.Images)
	p.PluginData = mapToJSON(req.PluginData)

	// Empty is not a legal value for any of these three — the columns have
	// CHECK constraints — so an absent one keeps what is already stored rather
	// than clearing it.
	if req.BarcodeSource != "" {
		p.BarcodeSource = req.BarcodeSource
	}
	if req.Unit != "" {
		p.Unit = req.Unit
	}
	if req.Status != "" {
		p.Status = req.Status
	}
}

// epochMillis converts a timestamp to the epoch-millisecond number the client
// works in. A zero time maps to 0 rather than a negative epoch, so an unset
// column does not read as a date in 1754.
func epochMillis(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}

// isoDatePtr formats a calendar date as yyyy-mm-dd. Expiry dates are days
// printed on a label, so they stay strings rather than becoming epoch numbers.
func isoDatePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.DateOnly)
	return &s
}

// parseISODate is isoDatePtr's inverse. The value is validated as
// datetime=2006-01-02 before it gets here, so an unparseable string means the
// field was absent or empty — nil, not an error.
func parseISODate(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse(time.DateOnly, *s)
	if err != nil {
		return nil
	}
	return &t
}

func uuidPtrToStringPtr(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	s := id.String()
	return &s
}

func parseUUIDPtr(s *string) *uuid.UUID {
	if s == nil || *s == "" {
		return nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil
	}
	return &id
}

func centsPtrToInt64Ptr(c *dto.Cents) *int64 {
	if c == nil {
		return nil
	}
	v := c.Int64()
	return &v
}

// jsonToStringSlice and jsonToMap decode the JSONB columns. Malformed stored
// JSON yields nil rather than an error: a single bad plugin_data blob must not
// fail the whole catalogue pull and leave the till unable to sell anything.
func jsonToStringSlice(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	return out
}

func jsonToMap(raw []byte) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// stringSliceToJSON and mapToJSON encode the JSONB columns. Both are NOT NULL,
// so an empty value becomes the literal [] / {} rather than nil.
func stringSliceToJSON(values []string) datatypes.JSON {
	if len(values) == 0 {
		return datatypes.JSON("[]")
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return datatypes.JSON("[]")
	}
	return datatypes.JSON(raw)
}

func mapToJSON(values map[string]any) datatypes.JSON {
	if len(values) == 0 {
		return datatypes.JSON("{}")
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return datatypes.JSON("{}")
	}
	return datatypes.JSON(raw)
}
