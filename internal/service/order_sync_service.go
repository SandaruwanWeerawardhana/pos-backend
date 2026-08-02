package service

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/SandaruwanWeerawardhana/pos-backend/internal/entity"
	"github.com/SandaruwanWeerawardhana/pos-backend/internal/repository"
)

// SyncOrderResult is the per-order outcome. The strings the handler maps these
// to are matched by the client, and "conflict" is never retried there — see
// dto.SyncResult* for why that makes it a last resort.
type SyncOrderResult string

const (
	ResultSynced        SyncOrderResult = "synced"
	ResultAlreadySynced SyncOrderResult = "already_synced"
	ResultConflict      SyncOrderResult = "conflict"
	ResultError         SyncOrderResult = "error"
)

// SyncOrderInput is one sale as the till recorded it. Money is integer cents;
// SoldAt is the till's own timestamp, not the server's receive time.
type SyncOrderInput struct {
	ClientGeneratedID string
	ReceiptNo         string
	Items             []SyncOrderItem
	Payments          []SyncOrderPayment
	TotalCents        int64
	TaxTotalCents     int64
	DiscountCents     int64
	PaymentMethod     string
	SoldAt            time.Time
	CashierID         *uuid.UUID
}

type SyncOrderItem struct {
	ProductID         *uuid.UUID
	Name              string
	Quantity          float64
	UnitPriceCents    int64
	TaxRate           float64
	Unit              string
	IsWeighted        bool
	LineDiscountCents int64
}

type SyncOrderPayment struct {
	Method        string
	AmountCents   int64
	TenderedCents *int64
	ChangeCents   *int64
	Reference     string
}

// SyncOutcome pairs an order's client id with what happened to it. One is
// produced for every submitted order, without exception.
type SyncOutcome struct {
	ClientGeneratedID string
	Result            SyncOrderResult
	ServerID          string
}

type OrderSyncService interface {
	Sync(ctx context.Context, businessID uuid.UUID, branchID *uuid.UUID, orders []SyncOrderInput) []SyncOutcome
}

type orderSyncService struct {
	tx TxRunner
	// newOrderRepos rebinds the repositories to the transaction's *gorm.DB, the
	// same pattern AuthService.Register uses. Every write this service makes
	// happens inside that transaction, so it holds no non-transactional
	// repository of its own.
	newOrderRepos func(tx *gorm.DB) OrderTxRepos
}

// OrderTxRepos bundles the repositories one order's write path needs.
type OrderTxRepos struct {
	Orders repository.OrderRepository
	Stock  repository.StockRepository
}

// DefaultOrderTxRepos is the production factory: real repositories bound to the
// transaction.
func DefaultOrderTxRepos(tx *gorm.DB) OrderTxRepos {
	return OrderTxRepos{
		Orders: repository.NewOrderRepository(tx),
		Stock:  repository.NewStockRepository(tx),
	}
}

func NewOrderSyncService(
	tx TxRunner,
	newOrderRepos func(tx *gorm.DB) OrderTxRepos,
) OrderSyncService {
	return &orderSyncService{tx: tx, newOrderRepos: newOrderRepos}
}

// Sync stores a batch of sales and returns one outcome per order, in the order
// submitted.
//
// Each order gets its own transaction rather than the batch sharing one. A
// single bad order in a batch of fifty must not roll back the forty-nine good
// ones: the client would mark them all as failed and resend everything, and any
// order it never hears back about is stranded locally until a page reload.
//
// This method therefore never returns an error — a failure becomes that order's
// outcome, and the loop continues.
func (s *orderSyncService) Sync(
	ctx context.Context,
	businessID uuid.UUID,
	branchID *uuid.UUID,
	orders []SyncOrderInput,
) []SyncOutcome {
	outcomes := make([]SyncOutcome, 0, len(orders))

	for _, in := range orders {
		outcome := SyncOutcome{ClientGeneratedID: in.ClientGeneratedID}

		serverID, err := s.syncOne(ctx, businessID, branchID, in)
		switch {
		case err == nil:
			outcome.Result = ResultSynced
			outcome.ServerID = serverID
		case errors.Is(err, repository.ErrAlreadySynced):
			// The expected result of the till resending a batch it already
			// pushed. Terminal success: no stock was deducted a second time.
			outcome.Result = ResultAlreadySynced
		default:
			// Transient by default. Reporting "conflict" here would tell the
			// client to give up on a real sale, so anything not provably
			// permanent is an error the client may retry.
			outcome.Result = ResultError
		}

		outcomes = append(outcomes, outcome)
	}

	return outcomes
}

func (s *orderSyncService) syncOne(
	ctx context.Context,
	businessID uuid.UUID,
	branchID *uuid.UUID,
	in SyncOrderInput,
) (string, error) {
	order := entity.Order{
		BusinessID:        businessID,
		BranchID:          branchID,
		ClientGeneratedID: in.ClientGeneratedID,
		PaymentMethod:     in.PaymentMethod,
		DiscountCents:     in.DiscountCents,
		TaxTotalCents:     in.TaxTotalCents,
		TotalCents:        in.TotalCents,
		CashierID:         in.CashierID,
		SoldAt:            in.SoldAt,
		SyncedAt:          time.Now(),
	}
	if in.ReceiptNo != "" {
		order.ReceiptNo = &in.ReceiptNo
	}

	// The client sends no subtotal, so derive it: it is the figure the tax and
	// total are built from and is worth storing for reporting.
	subtotal, serverTax, serverTotal := computeTotals(in)
	order.SubtotalCents = subtotal

	// Client figures are kept verbatim above — the customer holds a receipt
	// showing them. A disagreement is recorded, never corrected and never a
	// rejection.
	if serverTotal != in.TotalCents || serverTax != in.TaxTotalCents {
		order.TotalsMismatch = true
		order.ServerTotalCents = &serverTotal
		order.ServerTaxTotalCents = &serverTax
	}

	order.Items = make([]entity.OrderItem, 0, len(in.Items))
	for _, item := range in.Items {
		oi := entity.OrderItem{
			ProductID:         item.ProductID,
			Name:              item.Name,
			Quantity:          item.Quantity,
			UnitPriceCents:    item.UnitPriceCents,
			TaxRate:           item.TaxRate,
			IsWeighted:        item.IsWeighted,
			LineDiscountCents: item.LineDiscountCents,
		}
		if item.Unit != "" {
			oi.Unit = &item.Unit
		}
		order.Items = append(order.Items, oi)
	}

	order.Payments = make([]entity.OrderPayment, 0, len(in.Payments))
	for _, p := range in.Payments {
		op := entity.OrderPayment{
			Method:        p.Method,
			AmountCents:   p.AmountCents,
			TenderedCents: p.TenderedCents,
			ChangeCents:   p.ChangeCents,
		}
		if p.Reference != "" {
			op.Reference = &p.Reference
		}
		order.Payments = append(order.Payments, op)
	}

	err := s.tx.WithTransaction(ctx, func(ctx context.Context, tx *gorm.DB) error {
		repos := s.newOrderRepos(tx)

		// Insert first. If this order was already synced the insert reports it
		// and the transaction unwinds before any stock is touched — which is
		// what makes a replay safe rather than merely detectable.
		if err := repos.Orders.InsertIfNew(ctx, tx, &order); err != nil {
			return err
		}

		for _, item := range order.Items {
			if item.ProductID == nil {
				// A line whose product no longer exists still belongs on the
				// receipt, but there is no stock row to move.
				continue
			}

			balance, err := repos.Stock.ApplyDelta(ctx, tx, businessID, *item.ProductID, -item.Quantity)
			if err != nil {
				if errors.Is(err, repository.ErrNotFound) {
					// Product deleted, or belongs to another tenant. Recording
					// the sale matters more than the ledger line, so skip the
					// movement rather than failing a sale that already happened.
					continue
				}
				return err
			}

			movement := entity.StockMovement{
				BusinessID:    businessID,
				ProductID:     item.ProductID,
				ProductName:   item.Name,
				Type:          entity.MovementSale,
				QuantityDelta: -item.Quantity,
				BalanceAfter:  balance,
				ReferenceID:   &order.ID,
				CreatedBy:     in.CashierID,
			}
			if err := repos.Stock.RecordMovement(ctx, tx, &movement); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return "", err
	}

	return order.ID.String(), nil
}

// computeTotals recomputes the sale independently of the client, returning
// post-discount subtotal, tax, and grand total in cents.
//
// This mirrors computeCartTotal in pos-frontend/src/lib/cart-math.ts step for
// step, because any deviation would flag honest sales as mismatched and make the
// flag worthless. In particular, matching the client means:
//
//   - the raw subtotal accumulates unit_price * quantity as a float and is not
//     rounded per line, while tax IS rounded per line;
//   - line_discount_cents does not participate — the client tracks it per line
//     but does not subtract it in the total, so neither does this;
//   - the discount is clamped to the raw subtotal, and tax is scaled by the
//     resulting ratio rather than recomputed against the discounted base.
//
// Float arithmetic is deliberate here for the same reason: integer maths would
// round differently from the client and produce spurious mismatches.
func computeTotals(in SyncOrderInput) (subtotal, tax, total int64) {
	var rawSubtotal float64
	var rawTax int64
	for _, item := range in.Items {
		lineGross := float64(item.UnitPriceCents) * item.Quantity
		rawSubtotal += lineGross
		rawTax += int64(math.Round(lineGross * item.TaxRate))
	}

	// Rounded, not truncated. The client leaves this figure fractional for
	// weighted items (899 c/kg * 0.457 kg = 410.843) and the transport rounds it
	// on the way in, so rounding here too is what keeps the comparison honest —
	// truncating would flag every weighted sale as mismatched.
	rawSubtotalCents := int64(math.Round(rawSubtotal))

	discount := in.DiscountCents
	if discount < 0 {
		discount = 0
	}
	if discount > rawSubtotalCents {
		discount = rawSubtotalCents
	}

	var discountRatio float64
	if rawSubtotalCents > 0 {
		discountRatio = float64(discount) / float64(rawSubtotalCents)
	}

	subtotal = rawSubtotalCents - discount
	tax = int64(math.Round(float64(rawTax) * (1 - discountRatio)))

	return subtotal, tax, subtotal + tax
}
