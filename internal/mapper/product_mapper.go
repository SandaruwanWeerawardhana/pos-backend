package mapper

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"

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

		PriceCents:         p.PriceCents,
		TaxRate:            p.TaxRate,
		StockQuantity:      p.StockQuantity,
		CostCents:          p.CostCents,
		PurchasePriceCents: p.PurchasePriceCents,

		Category:    p.Category,
		Subcategory: p.Subcategory,
		Brand:       p.Brand,
		Description: p.Description,
		Unit:        p.Unit,
		Status:      p.Status,
		ProductType: p.ProductType,
		StorageType: p.StorageType,

		IsWeighted:       p.IsWeighted,
		IsVariableWeight: p.IsVariableWeight,
		AllowDiscount:    p.AllowDiscount,
		AllowReturns:     p.AllowReturns,
		TrackExpiry:      p.TrackExpiry,
		TrackBatch:       p.TrackBatch,

		ReorderLevel:    p.ReorderLevel,
		MinStockLevel:   p.MinStockLevel,
		DiscountPercent: p.DiscountPercent,

		ProductCode:         p.ProductCode,
		QRCode:              p.QRCode,
		ShelfLocation:       p.ShelfLocation,
		Branch:              p.Branch,
		SupplierProductCode: p.SupplierProductCode,
		ImageURL:            p.ImageURL,

		SupplierID:  uuidPtrToStringPtr(p.SupplierID),
		WarehouseID: uuidPtrToStringPtr(p.WarehouseID),

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

func uuidPtrToStringPtr(id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	s := id.String()
	return &s
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
