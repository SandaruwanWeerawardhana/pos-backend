// Package repository is the persistence layer: thin GORM wrappers over the
// entities, one interface per aggregate. Nothing above this layer touches
// *gorm.DB directly, and nothing here imports internal/dto or fiber (see
// .golangci.yml's depguard rules).
package repository

import "errors"

// ErrNotFound is returned by any single-row lookup that matched zero rows.
// Every tenant-scoped query filters by business_id in the same WHERE clause
// as the id, so a cross-tenant lookup also lands here — the caller must map
// it to HTTP 404, never 403, or it leaks that the resource exists.
var ErrNotFound = errors.New("repository: not found")
