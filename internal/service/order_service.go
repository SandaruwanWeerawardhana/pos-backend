package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
	"github.com/SandaruwanWeerawardhana/pos-backend/pkg/apperror"
)

/*
OrderListQuery is the read side's filter, restated here rather than reusing
repository.OrderListParams because handlers are not allowed to import the
repository package (see the depguard rules in .golangci.yml). Sort/Order have
already been validated against a whitelist by the handler; this layer passes
them through unchanged.
*/
type OrderListQuery struct {
	Limit  int
	Offset int
	Sort   string
	Order  string

	Search        string
	PaymentMethod string
	/*
		Bounds on the business date the sale was rung up on. Zero is unbounded.
	*/
	From time.Time
	To   time.Time
}

/*
OrderPage is one page of sales plus the total matching the same filters, so
the caller can render "1–25 of 340" without a second request.
*/
type OrderPage struct {
	Orders []entity.Order
	Total  int64
}

/*
OrderService reads sales back. Writing them is OrderSyncService's job and is
deliberately a separate interface: the write path is idempotent, batched and
transactional, and none of that belongs in a list query.
*/
type OrderService interface {
	List(ctx context.Context, businessID uuid.UUID, query OrderListQuery) (OrderPage, error)
	GetByClientID(ctx context.Context, businessID uuid.UUID, clientGeneratedID string) (*entity.Order, error)
}

type orderService struct {
	orders repository.OrderRepository
}

func NewOrderService(orders repository.OrderRepository) OrderService {
	return &orderService{orders: orders}
}

func (s *orderService) List(
	ctx context.Context,
	businessID uuid.UUID,
	query OrderListQuery,
) (OrderPage, error) {
	orders, total, err := s.orders.List(ctx, businessID, repository.OrderListParams{
		Limit:         query.Limit,
		Offset:        query.Offset,
		Sort:          query.Sort,
		Order:         query.Order,
		Search:        query.Search,
		PaymentMethod: query.PaymentMethod,
		From:          query.From,
		To:            query.To,
	})
	if err != nil {
		return OrderPage{}, apperror.Wrap(apperror.CodeDatabase, "failed to load orders", err)
	}

	return OrderPage{Orders: orders, Total: total}, nil
}

/*
GetByClientID loads one sale by the till's own id for the sale.

A miss is 404 whether the sale belongs to nobody or to another business —
distinguishing the two would confirm that a given receipt exists somewhere in
the system to whoever is asking.
*/
func (s *orderService) GetByClientID(
	ctx context.Context,
	businessID uuid.UUID,
	clientGeneratedID string,
) (*entity.Order, error) {
	order, err := s.orders.FindByClientID(ctx, businessID, clientGeneratedID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, apperror.New(apperror.CodeNotFound, "order not found")
		}
		return nil, apperror.Wrap(apperror.CodeDatabase, "failed to load order", err)
	}
	return order, nil
}
