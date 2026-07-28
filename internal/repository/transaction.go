package repository

import (
	"context"

	"gorm.io/gorm"
)

// TxManager runs a function inside a single database transaction, so a
// multi-repository write (e.g. register: business + branch + user + role
// assignment + audit log) either commits together or rolls back together.
// Callers construct fresh repositories bound to the tx passed into fn —
// there is no separate WithTx method on each repository.
type TxManager struct {
	db *gorm.DB
}

func NewTxManager(db *gorm.DB) *TxManager {
	return &TxManager{db: db}
}

// TxFn receives the *gorm.DB bound to the transaction.
type TxFn func(ctx context.Context, tx *gorm.DB) error

// WithTransaction runs fn inside a transaction, committing if fn returns
// nil and rolling back otherwise (including on panic, per gorm.Transaction).
func (m *TxManager) WithTransaction(ctx context.Context, fn TxFn) error {
	return m.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(ctx, tx)
	})
}
