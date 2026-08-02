package repository

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
)

//go:generate go run go.uber.org/mock/mockgen -source=order_repository.go -destination=mocks/order_repository_mock.go -package=mocks

// ErrAlreadySynced means an order with this client_generated_id is already
// stored for the business. It is a normal outcome of the till retrying a batch,
// not a failure: the caller reports "already_synced" and moves on.
var ErrAlreadySynced = errors.New("repository: order already synced")

// OrderListParams narrows and pages a sales query.
//
// Sort is interpolated into ORDER BY, which GORM does not escape, so it must
// already have been validated against a whitelist by the caller
// (pagination.Parse + dto.OrderSortFields). Nothing here re-checks it; treat an
// unvalidated value reaching this struct as SQL injection.
type OrderListParams struct {
	Limit  int
	Offset int
	Sort   string
	Order  string // "asc" | "desc"

	// Matched against receipt_no and client_generated_id. Already
	// LIKE-escaped by pagination.Parse.
	Search        string
	PaymentMethod string
	// Bounds on sold_at, the business date. Zero means unbounded.
	From time.Time
	To   time.Time
}

// OrderRepository persists sales pushed up by the till, and reads them back.
type OrderRepository interface {
	// InsertIfNew writes an order with its items and payments, and reports
	// ErrAlreadySynced if the business already has one with the same
	// client_generated_id.
	//
	// Uniqueness is enforced by the database, not by a preceding SELECT: two
	// concurrent pushes of the same order would both pass a read-then-write
	// check and double-count the sale. Callers must run this inside the same
	// transaction as any stock deduction, so a duplicate cannot deduct twice.
	InsertIfNew(ctx context.Context, tx *gorm.DB, order *entity.Order) error

	// List returns one page of a business's sales, newest first by default,
	// with items and payments preloaded, plus the total row count matching the
	// same filters (not the page length) so the client can page through.
	//
	// Items are preloaded rather than left lazy because the sales list shows a
	// line count per row and the detail view reprints the receipt; fetching them
	// per row would be an N+1 over a table that only grows.
	List(ctx context.Context, businessID uuid.UUID, params OrderListParams) ([]entity.Order, int64, error)

	// FindByID loads one sale by the till's own client_generated_id, scoped to
	// its business. That key, not the server id, because the client already
	// holds the sale under it and links to it from the sales list.
	//
	// Returns ErrNotFound for a missing id and for another tenant's id alike:
	// the caller must map both to 404, never 403, or it leaks that the sale
	// exists.
	FindByClientID(ctx context.Context, businessID uuid.UUID, clientGeneratedID string) (*entity.Order, error)
}

type orderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) OrderRepository {
	return &orderRepository{db: db}
}

func (r *orderRepository) InsertIfNew(ctx context.Context, tx *gorm.DB, order *entity.Order) error {
	db := r.db
	if tx != nil {
		db = tx
	}

	// DoNothing on the (business_id, client_generated_id) conflict rather than
	// letting the insert error: a replay is an expected outcome, and
	// distinguishing it from a real failure by parsing driver error strings
	// would be fragile. RowsAffected == 0 is the signal.
	//
	// CreateInBatches/associations are avoided here so the conflict clause
	// applies to the parent row specifically; items and payments are written by
	// the caller only once the parent insert is known to have won.
	res := db.WithContext(ctx).
		Omit("Items", "Payments").
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "business_id"}, {Name: "client_generated_id"}},
			DoNothing: true,
		}).
		Create(order)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrAlreadySynced
	}

	if len(order.Items) > 0 {
		for i := range order.Items {
			order.Items[i].OrderID = order.ID
		}
		if err := db.WithContext(ctx).Create(&order.Items).Error; err != nil {
			return err
		}
	}
	if len(order.Payments) > 0 {
		for i := range order.Payments {
			order.Payments[i].OrderID = order.ID
		}
		if err := db.WithContext(ctx).Create(&order.Payments).Error; err != nil {
			return err
		}
	}

	return nil
}

func (r *orderRepository) List(
	ctx context.Context,
	businessID uuid.UUID,
	params OrderListParams,
) ([]entity.Order, int64, error) {
	query := r.scoped(ctx, businessID, params)

	// Counted before the page is sliced, and on a query with no Preload: the
	// total is the number of matching orders, and joining their lines in would
	// both cost more and risk counting rows instead of orders.
	var total int64
	if err := query.Model(&entity.Order{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if total == 0 {
		return []entity.Order{}, 0, nil
	}

	var orders []entity.Order
	err := r.scoped(ctx, businessID, params).
		Preload("Items").
		Preload("Payments").
		// Tie-broken by id so two sales sharing a sold_at (a fast till, or a
		// batch synced from the same second) keep a stable order across pages
		// instead of one appearing twice and another never.
		Order(clause.OrderByColumn{
			Column: clause.Column{Name: params.Sort},
			Desc:   params.Order == "desc",
		}).
		Order("id").
		Limit(params.Limit).
		Offset(params.Offset).
		Find(&orders).Error
	if err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// scoped builds the filtered query shared by the count and the page fetch, so
// the two can never drift apart and report a total that does not match what
// paging through actually yields.
func (r *orderRepository) scoped(
	ctx context.Context,
	businessID uuid.UUID,
	params OrderListParams,
) *gorm.DB {
	query := r.db.WithContext(ctx).
		Model(&entity.Order{}).
		Where("business_id = ?", businessID)

	if params.PaymentMethod != "" {
		query = query.Where("payment_method = ?", params.PaymentMethod)
	}
	if !params.From.IsZero() {
		query = query.Where("sold_at >= ?", params.From)
	}
	if !params.To.IsZero() {
		query = query.Where("sold_at <= ?", params.To)
	}
	if params.Search != "" {
		// receipt_no is what a customer reads off a printed receipt over the
		// phone; client_generated_id is what a support engineer has. Both are
		// exact-ish identifiers, so this is a prefix-free contains match.
		//
		// Item names are matched too, via EXISTS rather than a join: a join
		// would return one row per matching line and make the count wrong. The
		// sales screen has always searched product names, and dropping that when
		// the list moved server-side would have been a silent regression.
		like := "%" + params.Search + "%"
		query = query.Where(
			`(receipt_no ILIKE ? OR client_generated_id ILIKE ? OR EXISTS (
				SELECT 1 FROM order_items
				WHERE order_items.order_id = orders.id AND order_items.name ILIKE ?
			))`,
			like, like, like,
		)
	}

	return query
}

func (r *orderRepository) FindByClientID(
	ctx context.Context,
	businessID uuid.UUID,
	clientGeneratedID string,
) (*entity.Order, error) {
	var order entity.Order
	err := r.db.WithContext(ctx).
		Preload("Items").
		Preload("Payments").
		Where("business_id = ? AND client_generated_id = ?", businessID, clientGeneratedID).
		First(&order).Error
	if err != nil {
		return nil, wrapNotFound(err)
	}
	return &order, nil
}

// StockRepository applies stock deductions and journals them. Kept alongside
// orders because Phase 1's only writer is order sync, inside the same
// transaction as the order insert.
type StockRepository interface {
	// ApplyDelta adjusts a product's stock and returns the resulting balance.
	// The update is a single arithmetic statement (stock_quantity + delta), not
	// a read-modify-write, so two concurrent sales of the same product cannot
	// lose one of the deductions.
	ApplyDelta(ctx context.Context, tx *gorm.DB, businessID, productID uuid.UUID, delta float64) (float64, error)
	RecordMovement(ctx context.Context, tx *gorm.DB, movement *entity.StockMovement) error
}

type stockRepository struct {
	db *gorm.DB
}

func NewStockRepository(db *gorm.DB) StockRepository {
	return &stockRepository{db: db}
}

func (r *stockRepository) ApplyDelta(
	ctx context.Context,
	tx *gorm.DB,
	businessID, productID uuid.UUID,
	delta float64,
) (float64, error) {
	db := r.db
	if tx != nil {
		db = tx
	}

	// RETURNING gives the post-update balance without a follow-up read, which
	// also keeps the value consistent with whatever concurrent updates the
	// database serialised around this one.
	var balances []float64
	err := db.WithContext(ctx).
		Model(&entity.Product{}).
		Where("business_id = ? AND id = ?", businessID, productID).
		Clauses(clause.Returning{Columns: []clause.Column{{Name: "stock_quantity"}}}).
		UpdateColumn("stock_quantity", gorm.Expr("stock_quantity + ?", delta)).
		Pluck("stock_quantity", &balances).Error
	if err != nil {
		return 0, err
	}
	if len(balances) == 0 {
		return 0, ErrNotFound
	}
	return balances[0], nil
}

func (r *stockRepository) RecordMovement(ctx context.Context, tx *gorm.DB, movement *entity.StockMovement) error {
	db := r.db
	if tx != nil {
		db = tx
	}
	return db.WithContext(ctx).Create(movement).Error
}
