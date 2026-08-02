package dto

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
)

// Cents is an integer-cents money value that tolerates a fractional number on
// the wire.
//
// It exists because the client can send one. computeCartTotal
// (pos-frontend/src/lib/cart-math.ts) multiplies unit_price_cents by a
// fractional quantity for weighted items priced per kg, and it used not to round
// the subtotal, so a 0.457 kg sale at 899 c/kg persisted and transmitted
// total_cents: 410.843. A plain int64 field rejects that outright — and
// encoding/json refuses even "410.0" — which would fail the whole sync batch
// and strand every sale in it, including the well-formed ones.
//
// The client now rounds, but this type stays: an offline till still holds
// unsynced orders written by the older code, and those must remain syncable.
//
// Rounding here rather than refusing is the safe direction: the sale already
// happened at the till and the customer is holding a receipt. The recomputed
// server total is recorded alongside the client's figures (see
// orders.totals_mismatch), so the discrepancy stays visible instead of being
// silently absorbed.
type Cents int64

func (c Cents) Int64() int64 { return int64(c) }

func (c Cents) MarshalJSON() ([]byte, error) {
	return json.Marshal(int64(c))
}

func (c *Cents) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*c = 0
		return nil
	}

	// Try the integer path first so exact values are never routed through
	// float64, where a large amount could lose precision.
	var asInt int64
	if err := json.Unmarshal(trimmed, &asInt); err == nil {
		*c = Cents(asInt)
		return nil
	}

	var asFloat float64
	if err := json.Unmarshal(trimmed, &asFloat); err != nil {
		return fmt.Errorf("dto: %s is not a valid money amount", trimmed)
	}
	if math.IsNaN(asFloat) || math.IsInf(asFloat, 0) {
		return fmt.Errorf("dto: %s is not a valid money amount", trimmed)
	}

	*c = Cents(int64(math.Round(asFloat)))
	return nil
}
