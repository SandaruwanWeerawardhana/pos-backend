package mapper

import (
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/dto"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

/*
ToOrderResponse maps a stored sale onto the wire shape the sales screen reads.

Items and payments are always non-nil slices. encoding/json renders a nil
slice as null, and the client calls .length and .map() on both directly — an
order that somehow lost its lines should render as an empty receipt, not throw
on the till.
*/
func ToOrderResponse(o entity.Order) dto.OrderResponse {
	res := dto.OrderResponse{
		ID:                o.ID.String(),
		ClientGeneratedID: o.ClientGeneratedID,
		ReceiptNo:         o.ReceiptNo,
		PaymentMethod:     o.PaymentMethod,

		SubtotalCents: o.SubtotalCents,
		DiscountCents: o.DiscountCents,
		TaxTotalCents: o.TaxTotalCents,
		TotalCents:    o.TotalCents,
		Refunded:      o.Refunded,

		TotalsMismatch:      o.TotalsMismatch,
		ServerTotalCents:    o.ServerTotalCents,
		ServerTaxTotalCents: o.ServerTaxTotalCents,

		CashierID: uuidPtrToStringPtr(o.CashierID),
		BranchID:  uuidPtrToStringPtr(o.BranchID),

		SoldAt:   epochMillis(o.SoldAt),
		SyncedAt: epochMillis(o.SyncedAt),

		Items:    make([]dto.OrderItemResponse, 0, len(o.Items)),
		Payments: make([]dto.OrderPaymentResponse, 0, len(o.Payments)),
	}

	for _, item := range o.Items {
		res.Items = append(res.Items, dto.OrderItemResponse{
			ProductID:         uuidPtrToStringPtr(item.ProductID),
			Name:              item.Name,
			Quantity:          item.Quantity,
			UnitPriceCents:    item.UnitPriceCents,
			TaxRate:           item.TaxRate,
			Unit:              item.Unit,
			IsWeighted:        item.IsWeighted,
			LineDiscountCents: item.LineDiscountCents,
		})
	}

	for _, payment := range o.Payments {
		res.Payments = append(res.Payments, dto.OrderPaymentResponse{
			Method:        payment.Method,
			AmountCents:   payment.AmountCents,
			TenderedCents: payment.TenderedCents,
			ChangeCents:   payment.ChangeCents,
			Reference:     payment.Reference,
		})
	}

	return res
}

/*
ToOrderResponseList always returns a non-nil slice, for the same reason
ToProductResponseList does.
*/
func ToOrderResponseList(orders []entity.Order) []dto.OrderResponse {
	out := make([]dto.OrderResponse, 0, len(orders))
	for _, o := range orders {
		out = append(out, ToOrderResponse(o))
	}
	return out
}
