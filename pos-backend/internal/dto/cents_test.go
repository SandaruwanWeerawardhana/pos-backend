package dto

import (
	"encoding/json"
	"testing"
)

func TestCentsUnmarshal(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int64
	}{
		{name: "plain integer", body: `1250`, want: 1250},
		{name: "zero", body: `0`, want: 0},
		{name: "negative", body: `-500`, want: -500},
		{name: "null becomes zero", body: `null`, want: 0},
		// encoding/json rejects both of these into an int64, which is the whole
		// reason this type exists.
		{name: "integral float", body: `410.0`, want: 410},
		// The real case: 899 c/kg * 0.457 kg, as the client's computeCartTotal
		// produces it for a weighted item.
		{name: "fractional rounds half up", body: `410.843`, want: 411},
		{name: "fractional rounds down", body: `410.4`, want: 410},
		{name: "negative fractional", body: `-410.6`, want: -411},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var c Cents
			if err := json.Unmarshal([]byte(tt.body), &c); err != nil {
				t.Fatalf("unmarshal %s: %v", tt.body, err)
			}
			if c.Int64() != tt.want {
				t.Errorf("%s -> %d, want %d", tt.body, c.Int64(), tt.want)
			}
		})
	}
}

func TestCentsRejectsNonNumeric(t *testing.T) {
	for _, body := range []string{`"1250"`, `true`, `{}`, `[]`} {
		var c Cents
		if err := json.Unmarshal([]byte(body), &c); err == nil {
			t.Errorf("%s was accepted, want an error", body)
		}
	}
}

// Cents must serialise back as a plain integer, so a response never repeats the
// fractional shape that made this type necessary.
func TestCentsMarshalsAsInteger(t *testing.T) {
	body, err := json.Marshal(Cents(411))
	if err != nil {
		t.Fatal(err)
	}
	if got := string(body); got != "411" {
		t.Errorf("marshalled to %s, want 411", got)
	}
}

// The end-to-end case: a weighted-item order body that a plain int64 field would
// have rejected, failing the entire sync batch.
func TestSyncOrderInputAcceptsFractionalWeightedTotals(t *testing.T) {
	body := `{
		"client_generated_id": "abc-123",
		"payment_method": "cash",
		"created_at": 1750000000000,
		"total_cents": 410.843,
		"tax_total_cents": 0,
		"discount_cents": 0,
		"items": [
			{"name": "Chicken Breast", "quantity": 0.457, "unit_price_cents": 899, "tax_rate": 0, "is_weighted": true}
		]
	}`

	var in SyncOrderInput
	if err := json.Unmarshal([]byte(body), &in); err != nil {
		t.Fatalf("a weighted-item order must be accepted, got: %v", err)
	}
	if in.TotalCents.Int64() != 411 {
		t.Errorf("TotalCents = %d, want 411", in.TotalCents.Int64())
	}
}
