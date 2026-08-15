import Dexie, { type Table } from "dexie";
import { computeCartTotal } from "@/lib/cart-math";
import type {
  AppNotification,
  Brand,
  CartItem,
  CartTotal,
  CashReconciliation,
  Category,
  Customer,
  DeletedProductRecord,
  Discount,
  HeldCart,
  PaymentMethod,
  PaymentSplit,
  PendingOrder,
  Product,
  ProductUnitRecord,
  PurchaseOrder,
  PurchaseReturn,
  Role,
  StaffUser,
  StockMovement,
  Supplier,
  SyncMetaRecord,
  UnitOperator,
  Warehouse,
  WarehouseLocation,
} from "@/lib/types";

/**
 * Local-first IndexedDB store. Cart + orders are created/edited offline and
 * synced later; products are cached from the server for offline lookup.
 *
 * In every `stores()` spec the primary key comes first, then the secondary
 * indexes. Booleans are never indexed — not a valid IndexedDB key type — so
 * `discounts.active` and `notifications.read` are filtered in JS instead.
 */
export class PosDB extends Dexie {
  products!: Table<Product, string>;
  cartItems!: Table<CartItem, number>;
  pendingOrders!: Table<PendingOrder, string>;
  syncMeta!: Table<SyncMetaRecord, string>;
  suppliers!: Table<Supplier, string>;
  discounts!: Table<Discount, string>;
  heldCarts!: Table<HeldCart, string>;
  cashReconciliations!: Table<CashReconciliation, string>;
  stockMovements!: Table<StockMovement, string>;
  warehouses!: Table<Warehouse, string>;
  purchaseOrders!: Table<PurchaseOrder, string>;
  purchaseReturns!: Table<PurchaseReturn, string>;
  roles!: Table<Role, string>;
  staffUsers!: Table<StaffUser, string>;
  notifications!: Table<AppNotification, string>;
  deletedProducts!: Table<DeletedProductRecord, string>;
  productUnits!: Table<ProductUnitRecord, string>;
  warehouseLocations!: Table<WarehouseLocation, string>;
  categories!: Table<Category, string>;
  brands!: Table<Brand, string>;
  customers!: Table<Customer, string>;

  constructor() {
    super("posDB");
    this.version(1).stores({
      products: "id, name, sku, barcode",
      cartItems: "++id, product_id",
      pendingOrders: "client_generated_id, sync_status, created_at",
      syncMeta: "key",
    });
    /**
     * v2: local-only tables with no server counterpart yet (no sync endpoint
     * for these exists - see CLAUDE.md / plan notes on this limitation).
     */
    this.version(2).stores({
      customers: "id, name",
      suppliers: "id, name",
      discounts: "id",
      heldCarts: "id, created_at",
      cashReconciliations: "id, created_at",
    });
    /**
     * v3: grocery catalogue, purchasing, staff, and notification tables. The
     * `category`/`supplier_id` product indexes added here turned out never to
     * be queried and are dropped again in v5.
     *
     * The upgrade backfills existing cached products, which predate the
     * catalogue fields, so list/filter UI never has to special-case undefined.
     */
    this.version(3)
      .stores({
        products: "id, name, sku, barcode, category, supplier_id",
        stockMovements: "id, product_id, type, created_at",
        warehouses: "id, name",
        purchaseOrders: "id, supplier_id, status, created_at",
        purchaseReturns: "id, purchase_order_id, created_at",
        roles: "id, name",
        staffUsers: "id, email, role_id",
        notifications: "id, kind, created_at",
        customerLedger: "id, customer_id, kind, created_at",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Product>("products")
          .toCollection()
          .modify((product) => {
            product.category ??= "Uncategorised";
            product.unit ??= "unit";
            product.reorder_level ??= 5;
          });
      });
    /**
     * v4: the delete outbox. Products deleted offline leave the products table
     * straight away and are recorded here until DELETE /products/{id} lands,
     * which also stops the next catalogue pull from resurrecting them.
     */
    this.version(4).stores({
      deletedProducts: "id, deleted_at",
    });
    /**
     * v5: trims the products table to what the code actually uses.
     *
     * Indexes: only `sku` and `barcode` are ever queried by key (the uniqueness
     * probes and addProduct). `name`, `category` and `supplier_id` were indexed
     * for filters that were then written as in-memory scans over the full
     * table, so they only cost write time. Dropping them leaves every read path
     * unchanged — none of them opened a cursor on those indexes.
     *
     * Columns: `status` was declared but never written by the form and never
     * read by the till or reports, so cached rows carrying it are cleaned up
     * here rather than left as a field with no type behind it.
     */
    this.version(5)
      .stores({
        products: "id, sku, barcode",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Record<string, unknown>>("products")
          .toCollection()
          .modify((product) => {
            delete product.status;
          });
      });
    /**
     * v6: custom units of measure, created from the product form's "+" next
     * to Product Unit rather than shipped as a fixed list.
     */
    this.version(6).stores({
      productUnits: "id, short_name",
    });
    /**
     * v7: named rack/shelf locations, created from the product form's "+" next
     * to Internal Location. Reference data only — stock is tracked against the
     * warehouse, so a location can be renamed or removed without moving any
     * quantity.
     */
    this.version(7).stores({
      warehouseLocations: "id, warehouse_id, name",
    });
    /**
     * v8: locations gain a short code ("A3-04") separate from an optional
     * longer name. The code is the identifier written onto the product, so
     * rows created under v7 have their name promoted to it.
     */
    this.version(8)
      .stores({
        warehouseLocations: "id, warehouse_id, code",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Record<string, unknown>>("warehouseLocations")
          .toCollection()
          .modify((location) => {
            location.code ??= location.name ?? "";
            delete location.name;
          });
      });
    /**
     * v9: named categories, managed from the Categories screen. Independent
     * of the free-text `product.category` field — see `Category`'s doc.
     */
    this.version(9).stores({
      categories: "id, code, name",
    });
    /**
     * v10: named brands, managed from the Brand screen. Independent of the
     * free-text `product.brand` field — see `Brand`'s doc.
     */
    this.version(10).stores({
      brands: "id, name",
    });
  }
}

export const db = new PosDB();

/**
 * Refreshes server products while protecting local work the server has not
 * acknowledged yet:
 *
 *   - `_local_only` rows (created here) and `_pending_update` rows (edited
 *     here) win over the server's copy, so an offline change is not undone by
 *     an older row arriving in the pull.
 *   - products in the delete outbox are dropped from the incoming list, so one
 *     deleted offline does not reappear on every cycle until its DELETE lands.
 *
 * Each flag clears as soon as its push succeeds, so a row stays local-wins for
 * at most one cycle after the server agrees. Unpushed rows are written last so
 * they overwrite the server's copy of the same id.
 */
export async function seedProducts(products: Product[]): Promise<void> {
  await db.transaction("rw", db.products, db.deletedProducts, async () => {
    const unpushed = await db.products
      .filter(
        (product) =>
          product._local_only === true || product._pending_update === true,
      )
      .toArray();
    const deletedIds = new Set(await db.deletedProducts.toCollection().primaryKeys());

    await db.products.clear();
    await db.products.bulkPut([
      ...products.filter((product) => !deletedIds.has(product.id)),
      ...unpushed,
    ]);
  });
}

/**
 * Products created on this device that POST /products has not stored yet.
 */
export async function listUnpushedProducts(): Promise<Product[]> {
  return db.products.filter((product) => product._local_only === true).toArray();
}

/**
 * Products edited on this device since their last successful push.
 * `_local_only` rows are excluded: their create carries the edits already, and
 * pushing an update for a product the server has never seen would only 404.
 */
export async function listEditedProducts(): Promise<Product[]> {
  return db.products
    .filter(
      (product) =>
        product._pending_update === true && product._local_only !== true,
    )
    .toArray();
}

export async function listPendingProductDeletes(): Promise<
  DeletedProductRecord[]
> {
  return db.deletedProducts.orderBy("deleted_at").toArray();
}

export async function clearPendingProductDelete(id: string): Promise<void> {
  await db.deletedProducts.delete(id);
}

/**
 * Clears a push flag once the server has the change. Read-modify-put rather
 * than delete-and-insert so a sale that adjusted stock in the meantime is not
 * rolled back to the pushed figure.
 */
async function clearProductFlag(
  id: string,
  flag: "_local_only" | "_pending_update",
): Promise<void> {
  await db.transaction("rw", db.products, async () => {
    const product = await db.products.get(id);
    if (!product) return;
    delete product[flag];
    await db.products.put(product);
  });
}

export async function markProductPushed(id: string): Promise<void> {
  await clearProductFlag(id, "_local_only");
}

export async function markProductUpdatePushed(id: string): Promise<void> {
  await clearProductFlag(id, "_pending_update");
}

/**
 * Searches name, sku, and barcode against the local table. Works fully offline.
 */
export async function searchProducts(query: string): Promise<Product[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return db.products.toArray();

  return db.products
    .filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle) ||
        product.barcode.toLowerCase().includes(needle),
    )
    .toArray();
}

export async function addProduct(product: Product): Promise<void> {
  await db.transaction("rw", db.products, async () => {
    const [existingSku, existingBarcode] = await Promise.all([
      db.products.where("sku").equals(product.sku).first(),
      db.products.where("barcode").equals(product.barcode).first(),
    ]);

    if (existingSku) {
      throw new Error("SKU already exists");
    }

    if (existingBarcode) {
      throw new Error("Barcode already exists");
    }

    await db.products.add({ ...product, _local_only: true });
  });
}

/**
 * Sets an absolute stock level and journals the delta as an adjustment so
 * the movement history stays complete no matter which screen made the change.
 */
export async function updateProductStock(
  productId: string,
  stockQuantity: number,
  reason = "Manual stock update",
): Promise<void> {
  await db.transaction("rw", db.products, db.stockMovements, async () => {
    const product = await db.products.get(productId);
    if (!product) return;
    const delta = stockQuantity - product.stock_quantity;
    await db.products.update(productId, { stock_quantity: stockQuantity });
    if (delta === 0) return;
    await db.stockMovements.add({
      id: crypto.randomUUID(),
      product_id: productId,
      product_name: product.name,
      type: "adjustment",
      quantity_delta: delta,
      balance_after: stockQuantity,
      reason,
      created_at: Date.now(),
    });
  });
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

/**
 * Applies a catalogue edit and queues it for the next sync. A product still
 * waiting on its create keeps only `_local_only`: that push sends the whole
 * row, edits included, so flagging it for an update as well would send a second
 * request for a product the server has only just been told about.
 */
export async function updateProduct(
  productId: string,
  changes: Partial<Omit<Product, "id">>,
): Promise<void> {
  await db.transaction("rw", db.products, async () => {
    const product = await db.products.get(productId);
    if (!product) return;
    await db.products.update(productId, {
      ...changes,
      ...(product._local_only ? {} : { _pending_update: true }),
    });
  });
}

/**
 * Removes the product locally and records a tombstone for the sync manager.
 *
 * The row leaves `products` immediately so it disappears from the till and
 * every report at once. A product the server has never seen (`_local_only`)
 * needs no tombstone — there is nothing to delete server-side.
 */
export async function deleteProduct(productId: string): Promise<void> {
  await db.transaction("rw", db.products, db.deletedProducts, async () => {
    const product = await db.products.get(productId);
    if (!product) return;
    await db.products.delete(productId);
    if (product._local_only) return;
    await db.deletedProducts.put({ id: productId, deleted_at: Date.now() });
  });
}

export async function addToCart(product: Product, quantity = 1): Promise<void> {
  await db.transaction("rw", db.cartItems, async () => {
    const existing = await db.cartItems
      .where("product_id")
      .equals(product.id)
      .first();

    if (existing?.id !== undefined) {
      await db.cartItems.update(existing.id, {
        quantity: existing.quantity + quantity,
      });
      return;
    }

    const item: CartItem = {
      product_id: product.id,
      name: product.name,
      quantity,
      unit_price_cents: product.price_cents,
      tax_rate: product.tax_rate,
      ...(product.unit ? { unit: product.unit } : {}),
      ...(product.is_weighted ? { is_weighted: true } : {}),
    };
    await db.cartItems.add(item);
  });
}

export async function removeFromCart(id: number): Promise<void> {
  await db.cartItems.delete(id);
}

export async function updateCartQuantity(id: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await db.cartItems.delete(id);
    return;
  }
  await db.cartItems.update(id, { quantity });
}

export async function clearCart(): Promise<void> {
  await db.cartItems.clear();
}

/**
 * Subtotal, tax, and grand total in integer cents. Tax is rounded per line
 * item to avoid float drift. discountCents, if given, reduces the taxable
 * subtotal (tax is reduced proportionally) before totaling.
 */
export async function getCartTotal(discountCents = 0): Promise<CartTotal> {
  const items = await db.cartItems.toArray();
  return computeCartTotal(items, discountCents);
}

/**
 * Options for `createLocalOrder`, which moves the current cart into a
 * pendingOrders record, optimistically deducts stock, and clears the cart.
 */
export interface CreateOrderOptions {
  discountCents?: number;
  payments?: PaymentSplit[];
  cashierId?: string;
}

/**
 * Receipt numbers are per-day sequential and human-readable so a cashier can
 * read one back over the phone. Sequence lives in syncMeta, not a counter
 * table, and resets when the date part changes.
 */
async function nextReceiptNo(): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const record = await db.syncMeta.get("receipt_sequence");
  const previous =
    typeof record?.value === "object" && record.value !== null
      ? (record.value as { date: string; seq: number })
      : { date: "", seq: 0 };
  const seq = previous.date === datePart ? previous.seq + 1 : 1;
  await db.syncMeta.put({
    key: "receipt_sequence",
    value: { date: datePart, seq },
  });
  return `R${datePart}-${String(seq).padStart(4, "0")}`;
}

export async function createLocalOrder(
  paymentMethod: PaymentMethod,
  options?: CreateOrderOptions,
): Promise<PendingOrder> {
  return db.transaction(
    "rw",
    [
      db.cartItems,
      db.pendingOrders,
      db.products,
      db.syncMeta,
      db.stockMovements,
    ],
    async () => {
      const items = await db.cartItems.toArray();
      // An order with no lines is not a sale, and the server rejects it
      // (POST /orders/sync requires items, min=1). Because that rejection is a
      // 400 for the whole batch, one empty order would block every other sale
      // queued behind it, so it must never reach the pendingOrders table.
      if (items.length === 0) {
        throw new Error("Cannot complete a sale with an empty cart");
      }

      const { tax_total_cents, total_cents } = computeCartTotal(
        items,
        options?.discountCents ?? 0,
      );

      const createdAt = Date.now();
      const order: PendingOrder = {
        client_generated_id: crypto.randomUUID(),
        items,
        total_cents,
        tax_total_cents,
        payment_method: paymentMethod,
        created_at: createdAt,
        sync_status: "pending",
        server_id: null,
        receipt_no: await nextReceiptNo(),
        ...(options?.discountCents
          ? { discount_cents: options.discountCents }
          : {}),
        ...(options?.payments?.length ? { payments: options.payments } : {}),
        ...(options?.cashierId ? { cashier_id: options.cashierId } : {}),
      };

      await db.pendingOrders.add(order);

      for (const item of items) {
        const product = await db.products.get(item.product_id);
        if (!product) continue;
        const nextStock = Math.max(0, product.stock_quantity - item.quantity);
        await db.products.update(product.id, { stock_quantity: nextStock });
        await db.stockMovements.add({
          id: crypto.randomUUID(),
          product_id: product.id,
          product_name: product.name,
          type: "sale",
          quantity_delta: -item.quantity,
          balance_after: nextStock,
          reference_id: order.client_generated_id,
          created_at: createdAt,
        });
      }

      await db.cartItems.clear();

      return order;
    },
  );
}

/** One CSV line of a historical sale, resolved but not yet grouped into an order. */
export interface ImportSaleLine {
  orderId: string;
  createdAt: number;
  sku: string;
  quantity: number;
  unitPriceCents?: number;
  taxRate?: number;
  paymentMethod?: PaymentMethod;
  discountCents?: number;
  cashierId?: string;
}

export interface ImportSalesError {
  orderId: string;
  message: string;
}

export interface ImportSalesResult {
  orders: PendingOrder[];
  errors: ImportSalesError[];
}

/**
 * Bulk-inserts historical sales (e.g. backfilled from another till or a
 * paper log) straight into `pendingOrders` so they sync like any local sale.
 * Unlike `createLocalOrder`, this never touches `products.stock_quantity` or
 * `stockMovements` — the stock movement for an already-completed sale
 * happened in the real world before the import, so replaying it here would
 * double-deduct stock that already reflects it.
 */
export async function importSalesOrders(
  lines: ImportSaleLine[],
): Promise<ImportSalesResult> {
  const groups = new Map<string, ImportSaleLine[]>();
  for (const line of lines) {
    const group = groups.get(line.orderId) ?? [];
    group.push(line);
    groups.set(line.orderId, group);
  }

  return db.transaction("rw", db.pendingOrders, db.products, async () => {
    const orders: PendingOrder[] = [];
    const errors: ImportSalesError[] = [];

    for (const [orderId, group] of groups) {
      const items: CartItem[] = [];
      let lineError: string | null = null;

      for (const line of group) {
        const product = await db.products
          .where("sku")
          .equalsIgnoreCase(line.sku)
          .first();
        if (!product) {
          lineError = `Unknown SKU "${line.sku}"`;
          break;
        }
        items.push({
          product_id: product.id,
          name: product.name,
          quantity: line.quantity,
          unit_price_cents: line.unitPriceCents ?? product.price_cents,
          tax_rate: line.taxRate ?? product.tax_rate,
          unit: product.unit,
          is_weighted: product.is_weighted,
        });
      }

      if (lineError) {
        errors.push({ orderId, message: lineError });
        continue;
      }

      const first = group[0];
      const { tax_total_cents, total_cents } = computeCartTotal(
        items,
        first.discountCents ?? 0,
      );

      const order: PendingOrder = {
        client_generated_id: crypto.randomUUID(),
        items,
        total_cents,
        tax_total_cents,
        payment_method: first.paymentMethod ?? "cash",
        created_at: first.createdAt,
        sync_status: "pending",
        server_id: null,
        receipt_no: orderId,
        ...(first.discountCents ? { discount_cents: first.discountCents } : {}),
        ...(first.cashierId ? { cashier_id: first.cashierId } : {}),
      };

      await db.pendingOrders.add(order);
      orders.push(order);
    }

    return { orders, errors };
  });
}

/**
 * Distinct category names present in the local catalogue, for filter chips.
 */
export async function listCategories(): Promise<string[]> {
  const products = await db.products.toArray();
  const names = new Set<string>();
  for (const product of products) {
    names.add(product.category?.trim() || "Uncategorised");
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Uniqueness probes for the product form. `addProduct` re-checks inside its
 * transaction — these exist so the form can report a clash inline while the
 * user is still typing, rather than only on submit.
 */
export async function isSkuTaken(sku: string, exceptId?: string): Promise<boolean> {
  const needle = sku.trim();
  if (!needle) return false;
  const match = await db.products.where("sku").equals(needle).first();
  return match !== undefined && match.id !== exceptId;
}

export async function isBarcodeTaken(
  barcode: string,
  exceptId?: string,
): Promise<boolean> {
  const needle = barcode.trim();
  if (!needle) return false;
  const match = await db.products.where("barcode").equals(needle).first();
  return match !== undefined && match.id !== exceptId;
}

export async function listBrands(): Promise<string[]> {
  const products = await db.products.toArray();
  const names = new Set<string>();
  for (const product of products) {
    if (product.brand?.trim()) names.add(product.brand.trim());
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Subcategories in use, optionally narrowed to one parent category. The
 * taxonomy is free-form — a subcategory exists because a product was filed
 * under it — so there is no separate table to read.
 */
export async function listSubcategories(category?: string): Promise<string[]> {
  const products = await db.products.toArray();
  const needle = category?.trim().toLowerCase();
  const names = new Set<string>();
  for (const product of products) {
    if (!product.subcategory?.trim()) continue;
    if (needle && product.category?.trim().toLowerCase() !== needle) continue;
    names.add(product.subcategory.trim());
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Rack/shelf locations, sorted by code for the picker. Locations created
 * before this table existed still appear: any code already written onto a
 * product is folded in, so the list never loses a shelf the catalogue is
 * using.
 */
export async function listWarehouseLocations(): Promise<WarehouseLocation[]> {
  const [saved, products] = await Promise.all([
    db.warehouseLocations.toArray(),
    db.products.toArray(),
  ]);

  const seen = new Set(
    saved.map((entry) => `${entry.warehouse_id}::${entry.code.toLowerCase()}`),
  );
  const derived: WarehouseLocation[] = [];

  for (const product of products) {
    for (const entry of product.opening_stock ?? []) {
      const code = entry.location?.trim();
      if (!code) continue;
      const key = `${entry.warehouse_id}::${code.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      derived.push({
        id: key,
        warehouse_id: entry.warehouse_id,
        code,
        created_at: "",
      });
    }
  }

  return [...saved, ...derived].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Adds a location to one warehouse. Codes are unique per warehouse, not
 * globally — "A1" in the back store and "A1" on the shop floor are different
 * shelves and both are legitimate.
 */
export async function addWarehouseLocation(input: {
  warehouse_id: string;
  code: string;
  name?: string;
}): Promise<WarehouseLocation> {
  const code = input.code.trim();
  const name = input.name?.trim();
  if (!input.warehouse_id) throw new Error("Warehouse is required");
  if (!code) throw new Error("Rack/location code is required");

  return db.transaction("rw", db.warehouseLocations, async () => {
    const clash = await db.warehouseLocations
      .where("warehouse_id")
      .equals(input.warehouse_id)
      .filter((entry) => entry.code.toLowerCase() === code.toLowerCase())
      .first();
    if (clash) throw new Error("That code already exists in this warehouse");

    const location: WarehouseLocation = {
      id: crypto.randomUUID(),
      warehouse_id: input.warehouse_id,
      code,
      ...(name ? { name } : {}),
      created_at: new Date().toISOString(),
    };
    await db.warehouseLocations.add(location);
    return location;
  });
}

export async function listProductUnits(): Promise<ProductUnitRecord[]> {
  const units = await db.productUnits.toArray();
  return units.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Custom unit created from the product form. `short_name` is what actually
 * gets stored on `product.unit` / `sale_unit` / `purchase_unit`, so it must
 * be unique against both existing custom units and the built-in options
 * (checked by the caller, which knows the fixed list).
 */
export async function addProductUnit(input: {
  name: string;
  short_name: string;
  base_unit?: string;
  operator?: UnitOperator;
  operation_value?: number;
}): Promise<ProductUnitRecord> {
  const name = input.name.trim();
  const shortName = input.short_name.trim();
  if (!name) throw new Error("Unit name is required");
  if (!shortName) throw new Error("Short name is required");

  return db.transaction("rw", db.productUnits, async () => {
    const existing = await db.productUnits.where("short_name").equals(shortName).first();
    if (existing) throw new Error("Short name already exists");

    const unit: ProductUnitRecord = {
      id: crypto.randomUUID(),
      name,
      short_name: shortName,
      base_unit: input.base_unit?.trim() || undefined,
      operator: input.operator ?? "*",
      operation_value: input.operation_value ?? 1,
      created_at: new Date().toISOString(),
    };
    await db.productUnits.add(unit);
    return unit;
  });
}

export async function updateProductUnit(
  id: string,
  changes: {
    name?: string;
    short_name?: string;
    base_unit?: string;
    operator?: UnitOperator;
    operation_value?: number;
  },
): Promise<void> {
  const name = changes.name?.trim();
  const shortName = changes.short_name?.trim();
  if (name === "") throw new Error("Unit name is required");
  if (shortName === "") throw new Error("Short name is required");

  return db.transaction("rw", db.productUnits, async () => {
    if (shortName) {
      const clash = await db.productUnits
        .where("short_name")
        .equals(shortName)
        .first();
      if (clash && clash.id !== id) throw new Error("Short name already exists");
    }

    await db.productUnits.update(id, {
      ...(name ? { name } : {}),
      ...(shortName ? { short_name: shortName } : {}),
      ...(changes.base_unit !== undefined
        ? { base_unit: changes.base_unit.trim() || undefined }
        : {}),
      ...(changes.operator ? { operator: changes.operator } : {}),
      ...(changes.operation_value !== undefined
        ? { operation_value: changes.operation_value }
        : {}),
    });
  });
}

export async function deleteProductUnit(id: string): Promise<void> {
  await db.productUnits.delete(id);
}

/**
 * Newest first, matching creation order on the Categories screen.
 */
export async function listCategoryRecords(): Promise<Category[]> {
  const categories = await db.categories.toArray();
  return categories.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addCategory(input: {
  code: string;
  name: string;
  icon?: string;
}): Promise<Category> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) throw new Error("Category code is required");
  if (!name) throw new Error("Category name is required");

  return db.transaction("rw", db.categories, async () => {
    const codeClash = await db.categories
      .filter((category) => category.code.toLowerCase() === code.toLowerCase())
      .first();
    if (codeClash) throw new Error("Category code already exists");

    const nameClash = await db.categories
      .filter((category) => category.name.toLowerCase() === name.toLowerCase())
      .first();
    if (nameClash) throw new Error("Category name already exists");

    const category: Category = {
      id: crypto.randomUUID(),
      code,
      name,
      icon: input.icon?.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await db.categories.add(category);
    return category;
  });
}

export async function updateCategory(
  id: string,
  changes: { code?: string; name?: string; icon?: string },
): Promise<void> {
  const code = changes.code?.trim();
  const name = changes.name?.trim();
  if (code === "") throw new Error("Category code is required");
  if (name === "") throw new Error("Category name is required");

  return db.transaction("rw", db.categories, async () => {
    if (code) {
      const codeClash = await db.categories
        .filter(
          (category) =>
            category.id !== id && category.code.toLowerCase() === code.toLowerCase(),
        )
        .first();
      if (codeClash) throw new Error("Category code already exists");
    }
    if (name) {
      const nameClash = await db.categories
        .filter(
          (category) =>
            category.id !== id && category.name.toLowerCase() === name.toLowerCase(),
        )
        .first();
      if (nameClash) throw new Error("Category name already exists");
    }

    await db.categories.update(id, {
      ...(code ? { code } : {}),
      ...(name ? { name } : {}),
      ...(changes.icon !== undefined ? { icon: changes.icon.trim() || undefined } : {}),
    });
  });
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

/**
 * Newest first, matching creation order on the Brand screen.
 */
export async function listBrandRecords(): Promise<Brand[]> {
  const brands = await db.brands.toArray();
  return brands.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addBrand(input: {
  name: string;
  description?: string;
  image_url?: string;
}): Promise<Brand> {
  const name = input.name.trim();
  if (!name) throw new Error("Brand name is required");

  return db.transaction("rw", db.brands, async () => {
    const clash = await db.brands
      .filter((brand) => brand.name.toLowerCase() === name.toLowerCase())
      .first();
    if (clash) throw new Error("Brand name already exists");

    const brand: Brand = {
      id: crypto.randomUUID(),
      name,
      description: input.description?.trim() || undefined,
      image_url: input.image_url || undefined,
      created_at: new Date().toISOString(),
    };
    await db.brands.add(brand);
    return brand;
  });
}

export async function updateBrand(
  id: string,
  changes: { name?: string; description?: string; image_url?: string },
): Promise<void> {
  const name = changes.name?.trim();
  if (name === "") throw new Error("Brand name is required");

  return db.transaction("rw", db.brands, async () => {
    if (name) {
      const clash = await db.brands
        .filter(
          (brand) => brand.id !== id && brand.name.toLowerCase() === name.toLowerCase(),
        )
        .first();
      if (clash) throw new Error("Brand name already exists");
    }

    await db.brands.update(id, {
      ...(name ? { name } : {}),
      ...(changes.description !== undefined
        ? { description: changes.description.trim() || undefined }
        : {}),
      ...(changes.image_url !== undefined
        ? { image_url: changes.image_url || undefined }
        : {}),
    });
  });
}

export async function deleteBrand(id: string): Promise<void> {
  await db.brands.delete(id);
}

/**
 * Persisted once on first access, never changed after that.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await db.syncMeta.get("device_id");
  if (existing && typeof existing.value === "string") return existing.value;

  const deviceId = crypto.randomUUID();
  await db.syncMeta.put({ key: "device_id", value: deviceId });
  return deviceId;
}

export async function getLastSyncedAt(): Promise<number | null> {
  const record = await db.syncMeta.get("last_synced_at");
  return typeof record?.value === "number" ? record.value : null;
}

export async function setLastSyncedAt(timestamp: number): Promise<void> {
  await db.syncMeta.put({ key: "last_synced_at", value: timestamp });
}

export * from "./suppliers";
export * from "./customers";
export * from "./discounts";
export * from "./held-carts";
export * from "./cash-reconciliation";
export * from "./inventory";
export * from "./purchases";
export * from "./users";
export * from "./notifications";
export * from "./settings";
export * from "./reports";
export * from "./reports-3d";
