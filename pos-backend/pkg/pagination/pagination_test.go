package pagination

import (
	"testing"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

var whitelist = []string{"created_at", "name"}

func TestParseClampsPage(t *testing.T) {
	p, err := Parse(0, 20, "", "", "", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	if p.Page != DefaultPage {
		t.Errorf("Page = %d, want %d", p.Page, DefaultPage)
	}
}

func TestParseClampsPerPageUpper(t *testing.T) {
	p, err := Parse(1, 500, "", "", "", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	if p.PerPage != MaxPerPage {
		t.Errorf("PerPage = %d, want %d", p.PerPage, MaxPerPage)
	}
}

func TestParseClampsPerPageLower(t *testing.T) {
	p, err := Parse(1, 0, "", "", "", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	if p.PerPage != DefaultPerPage {
		t.Errorf("PerPage = %d, want %d", p.PerPage, DefaultPerPage)
	}
}

func TestParseDefaultsSortToFirstWhitelistEntry(t *testing.T) {
	p, err := Parse(1, 20, "", "", "", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	if p.Sort != "created_at" {
		t.Errorf("Sort = %q, want created_at", p.Sort)
	}
}

func TestParseRejectsSQLInjectionSort(t *testing.T) {
	_, err := Parse(1, 20, "created_at; DROP TABLE users--", "", "", whitelist)
	if err == nil {
		t.Fatal("expected an error for a non-whitelisted sort field")
	}
	ae, ok := apperror.As(err)
	if !ok || ae.Code != apperror.CodeValidationError {
		t.Errorf("expected a VALIDATION_ERROR AppError, got %v", err)
	}
}

func TestParseNormalizesOrder(t *testing.T) {
	p, err := Parse(1, 20, "name", "bogus", "", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	if p.Order != "desc" {
		t.Errorf("Order = %q, want desc for an invalid input", p.Order)
	}
}

func TestParseEscapesSearchWildcards(t *testing.T) {
	p, err := Parse(1, 20, "", "", "100%_off", whitelist)
	if err != nil {
		t.Fatal(err)
	}
	want := `100\%\_off`
	if p.Search != want {
		t.Errorf("Search = %q, want %q", p.Search, want)
	}
}

func TestOffset(t *testing.T) {
	p := Params{Page: 3, PerPage: 20}
	if got := p.Offset(); got != 40 {
		t.Errorf("Offset() = %d, want 40", got)
	}
}

func TestNewMetaComputesTotalPagesAndFlags(t *testing.T) {
	p := Params{Page: 2, PerPage: 10}
	meta := NewMeta(p, 25)

	if meta.TotalPages != 3 {
		t.Errorf("TotalPages = %d, want 3", meta.TotalPages)
	}
	if !meta.HasNext || !meta.HasPrev {
		t.Errorf("HasNext/HasPrev = %v/%v, want true/true", meta.HasNext, meta.HasPrev)
	}
}

func TestNewMetaZeroTotalGivesOnePage(t *testing.T) {
	p := Params{Page: 1, PerPage: 20}
	meta := NewMeta(p, 0)

	if meta.TotalPages != 1 {
		t.Errorf("TotalPages = %d, want 1", meta.TotalPages)
	}
	if meta.HasNext || meta.HasPrev {
		t.Errorf("HasNext/HasPrev = %v/%v, want false/false", meta.HasNext, meta.HasPrev)
	}
}
