// Package migrations embeds the goose SQL migration files into the binary,
// so the API, migrate, and seed binaries all ship a self-contained schema
// with nothing extra to COPY into the Docker image.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
