// Package pagination clamps list-endpoint query params and validates sort
// fields against a per-endpoint whitelist. GORM does not escape ORDER BY
// clauses, so interpolating a raw client-supplied sort field is a SQL
// injection vector; every caller must supply the exact columns it allows.
package pagination

import (
	"strings"

	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/response"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/strutil"
)

const (
	DefaultPage    = 1
	DefaultPerPage = 20
	MinPerPage     = 1
	MaxPerPage     = 100
)

type Params struct {
	Page    int
	PerPage int
	Sort    string
	Order   string // "asc" | "desc"
	Search  string
}

// Parse clamps page/per_page into range and validates sort against
// sortWhitelist. An empty sort falls back to the whitelist's first (default)
// entry; an unlisted sort is rejected outright rather than silently ignored.
func Parse(page, perPage int, sort, order, search string, sortWhitelist []string) (Params, error) {
	if page < 1 {
		page = DefaultPage
	}
	if perPage < MinPerPage {
		perPage = DefaultPerPage
	}
	if perPage > MaxPerPage {
		perPage = MaxPerPage
	}

	order = strings.ToLower(strings.TrimSpace(order))
	if order != "asc" && order != "desc" {
		order = "desc"
	}

	if sort == "" {
		if len(sortWhitelist) > 0 {
			sort = sortWhitelist[0]
		}
	} else if !contains(sortWhitelist, sort) {
		return Params{}, apperror.WithFields(
			apperror.CodeValidationError,
			"invalid sort field",
			[]apperror.FieldError{{
				Field:   "sort",
				Rule:    "oneof",
				Message: "sort must be one of the allowed fields for this endpoint",
				Value:   sort,
			}},
		)
	}

	return Params{
		Page:    page,
		PerPage: perPage,
		Sort:    sort,
		Order:   order,
		Search:  strutil.EscapeLike(strings.TrimSpace(search)),
	}, nil
}

func (p Params) Offset() int { return (p.Page - 1) * p.PerPage }

func contains(list []string, v string) bool {
	for _, item := range list {
		if item == v {
			return true
		}
	}
	return false
}

// NewMeta computes response pagination metadata from a total row count.
func NewMeta(p Params, total int64) response.Meta {
	totalPages := int(total) / p.PerPage
	if int(total)%p.PerPage != 0 {
		totalPages++
	}
	if totalPages == 0 {
		totalPages = 1
	}
	return response.Meta{
		Page:       p.Page,
		PerPage:    p.PerPage,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    p.Page < totalPages,
		HasPrev:    p.Page > 1,
	}
}
