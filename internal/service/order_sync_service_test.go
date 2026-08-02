package service

import "testing"

/*
computeTotals has to agree with the client's computeCartTotal
(pos-frontend/src/lib/cart-math.ts) to the cent. Any divergence flags honest
sales as mismatched, so the expected values below are what that function
produces for the same inputs — they are the contract, not a description of
this implementation.
*/
func TestComputeTotals(t *testing.T) {
	tests := []struct {
		name          string
		items         []SyncOrderItem
		discountCents int64
		wantSubtotal  int64
		wantTax       int64
		wantTotal     int64
	}{
		{
			name: "single untaxed line",
			items: []SyncOrderItem{
				{UnitPriceCents: 199, Quantity: 2, TaxRate: 0},
			},
			wantSubtotal: 398,
			wantTax:      0,
			wantTotal:    398,
		},
		{
			name: "tax rounded per line, not once at the end",
			items: []SyncOrderItem{
				/*
					219*1*0.08 = 17.52 -> 18, and 129*1*0.08 = 10.32 -> 10.
					Summing first (348*0.08 = 27.84 -> 28) would give 28, so this
					case fails if the rounding moves.
				*/
				{UnitPriceCents: 219, Quantity: 1, TaxRate: 0.08},
				{UnitPriceCents: 129, Quantity: 1, TaxRate: 0.08},
			},
			wantSubtotal: 348,
			wantTax:      28,
			wantTotal:    376,
		},
		{
			name: "fractional weight quantity",
			items: []SyncOrderItem{
				/*
					A weighted item priced per kg: 899 cents/kg * 0.457 kg.
				*/
				{UnitPriceCents: 899, Quantity: 0.457, TaxRate: 0},
			},
			/*
				410.843 raw. The client rounds this to 411 before persisting, and
				dto.Cents rounds an older client's fractional 410.843 to the same
				figure, so the recompute must round the same way or every weighted
				sale would be flagged as mismatched.
			*/
			wantSubtotal: 411,
			wantTax:      0,
			wantTotal:    411,
		},
		{
			name: "discounted weighted line clamps against the rounded subtotal",
			items: []SyncOrderItem{
				{UnitPriceCents: 899, Quantity: 0.457, TaxRate: 0.08},
			},
			/*
				Both sides round the raw subtotal to 411 first and take the
				discount ratio against that, rather than against 410.843. rawTax
				is round(410.843*0.08) = 33, ratio is 200/411, so tax is
				round(33 * (1 - 200/411)) = 17.
			*/
			discountCents: 200,
			wantSubtotal:  211,
			wantTax:       17,
			wantTotal:     228,
		},
		{
			name: "order discount scales tax proportionally",
			items: []SyncOrderItem{
				{UnitPriceCents: 1000, Quantity: 1, TaxRate: 0.10},
			},
			discountCents: 500,
			wantSubtotal:  500,
			/*
				rawTax 100, ratio 0.5, so 100 * (1-0.5) = 50.
			*/
			wantTax:   50,
			wantTotal: 550,
		},
		{
			name: "discount larger than subtotal is clamped, never negative",
			items: []SyncOrderItem{
				{UnitPriceCents: 500, Quantity: 1, TaxRate: 0.10},
			},
			discountCents: 900,
			wantSubtotal:  0,
			wantTax:       0,
			wantTotal:     0,
		},
		{
			name: "line_discount_cents does not affect the total",
			items: []SyncOrderItem{
				/*
					The client tracks a per-line discount but does not subtract it
					in computeCartTotal, so neither may this.
				*/
				{UnitPriceCents: 1000, Quantity: 1, TaxRate: 0, LineDiscountCents: 300},
			},
			wantSubtotal: 1000,
			wantTax:      0,
			wantTotal:    1000,
		},
		{
			name:         "empty basket",
			items:        nil,
			wantSubtotal: 0,
			wantTax:      0,
			wantTotal:    0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := SyncOrderInput{Items: tt.items, DiscountCents: tt.discountCents}
			subtotal, tax, total := computeTotals(in)

			if subtotal != tt.wantSubtotal {
				t.Errorf("subtotal = %d, want %d", subtotal, tt.wantSubtotal)
			}
			if tax != tt.wantTax {
				t.Errorf("tax = %d, want %d", tax, tt.wantTax)
			}
			if total != tt.wantTotal {
				t.Errorf("total = %d, want %d", total, tt.wantTotal)
			}
		})
	}
}

/*
A negative discount must not inflate the total by being added back.
*/
func TestComputeTotalsIgnoresNegativeDiscount(t *testing.T) {
	in := SyncOrderInput{
		Items:         []SyncOrderItem{{UnitPriceCents: 1000, Quantity: 1}},
		DiscountCents: -500,
	}

	subtotal, _, total := computeTotals(in)

	if subtotal != 1000 || total != 1000 {
		t.Errorf("subtotal/total = %d/%d, want 1000/1000", subtotal, total)
	}
}
