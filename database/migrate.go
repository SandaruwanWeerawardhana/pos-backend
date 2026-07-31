package database

import (
	"database/sql"
	"fmt"

	"github.com/pressly/goose/v3"

	"github.com/SandaruwanWeerawardhana/pos-backend/database/migrations"
)

// Migrator drives the embedded goose SQL migrations against an explicit
// *sql.DB, so the same code path runs against a real Postgres, a compose
// service, or a testcontainers instance.
type Migrator struct {
	db *sql.DB
}

// NewMigrator points goose at the embedded migrations.FS. Only one Migrator
// should run migrations concurrently per database — pass 1 runs it as a
// single `migrate` job in the compose `tools` profile, not from replicas, so
// goose's session-level advisory locking is not wired up yet.
func NewMigrator(db *sql.DB) (*Migrator, error) {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return nil, fmt.Errorf("database: set goose dialect: %w", err)
	}
	return &Migrator{db: db}, nil
}

func (m *Migrator) Up() error {
	return goose.Up(m.db, ".")
}

func (m *Migrator) Down() error {
	return goose.Down(m.db, ".")
}

func (m *Migrator) DownTo(version int64) error {
	return goose.DownTo(m.db, ".", version)
}

func (m *Migrator) Status() error {
	return goose.Status(m.db, ".")
}

func (m *Migrator) Version() (int64, error) {
	return goose.GetDBVersion(m.db)
}
