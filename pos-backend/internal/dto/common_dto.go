// Package dto holds the request/response shapes crossing the HTTP boundary.
// Entities never cross this boundary directly — mappers translate between
// the two — so a column rename never becomes a silent wire-format change.
package dto

// PaginationQuery is the common query-string shape for list endpoints.
type PaginationQuery struct {
	Page    int    `query:"page"`
	PerPage int    `query:"per_page"`
	Sort    string `query:"sort"`
	Order   string `query:"order"`
	Search  string `query:"search"`
}
