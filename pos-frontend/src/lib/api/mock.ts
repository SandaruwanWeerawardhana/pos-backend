import type {
  OrderListParams,
  OrderPage,
  PendingOrder,
  Product,
  ServerOrder,
} from "@/lib/types";
import type {
  ApiClient,
  AuthUser,
  LoginResult,
  ProfileUpdate,
  SyncOrderOutcome,
  SyncOrderResult,
  SyncOrdersResponse,
} from "./client";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Bumped from v1 when the seed catalogue changed shape, and from v2 when the
 * fake started storing synced orders rather than only their ids: an old blob
 * would otherwise serve an empty sales list on a till that has been selling.
 */
const STORAGE_KEY = "mock_api_state_v3";
const DEFAULT_SYNC_DELAY_MS = 800;

/**
 * Expiry dates are generated relative to "now" so a freshly-cloned repo always
 * demonstrates the near-expiry and expired alert states, rather than showing a
 * catalogue that expired years ago.
 */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_PRODUCTS: Product[] = [
  /* Fresh produce - weighted, priced per kg */
  { id: "p_banana", name: "Bananas", sku: "PRD-BAN", barcode: "8901100000012", price_cents: 199, cost_cents: 110, tax_rate: 0, stock_quantity: 84, category: "Fresh Produce", brand: "Harvest Hill", unit: "kg", is_weighted: true, reorder_level: 20, shelf_location: "A1-01",
    batches: [{ batch_no: "BAN-2401", expiry_date: isoDaysFromNow(4), quantity: 84, cost_cents: 110 }] },
  { id: "p_apple_gala", name: "Gala Apples", sku: "PRD-APG", barcode: "8901100000029", price_cents: 329, cost_cents: 190, tax_rate: 0, stock_quantity: 62, category: "Fresh Produce", brand: "Harvest Hill", unit: "kg", is_weighted: true, reorder_level: 15, shelf_location: "A1-02",
    batches: [{ batch_no: "APG-2402", expiry_date: isoDaysFromNow(11), quantity: 62, cost_cents: 190 }] },
  { id: "p_tomato", name: "Vine Tomatoes", sku: "PRD-TOM", barcode: "8901100000036", price_cents: 289, cost_cents: 160, tax_rate: 0, stock_quantity: 9, category: "Fresh Produce", brand: "Daily Fresh", unit: "kg", is_weighted: true, reorder_level: 12, shelf_location: "A1-03",
    batches: [{ batch_no: "TOM-2403", expiry_date: isoDaysFromNow(2), quantity: 9, cost_cents: 160 }] },
  { id: "p_potato", name: "Baking Potatoes", sku: "PRD-POT", barcode: "8901100000043", price_cents: 149, cost_cents: 70, tax_rate: 0, stock_quantity: 140, category: "Fresh Produce", brand: "Harvest Hill", unit: "kg", is_weighted: true, reorder_level: 30, shelf_location: "A1-04" },
  { id: "p_spinach", name: "Baby Spinach 200g", sku: "PRD-SPN", barcode: "8901100000050", price_cents: 219, cost_cents: 135, tax_rate: 0, stock_quantity: 0, category: "Fresh Produce", brand: "Daily Fresh", unit: "pack", reorder_level: 10, shelf_location: "A1-06",
    batches: [{ batch_no: "SPN-2312", expiry_date: isoDaysFromNow(-2), quantity: 0, cost_cents: 135 }] },

  /* Bakery */
  { id: "p_sourdough", name: "Sourdough Loaf", sku: "BAK-SDL", barcode: "8901200000015", price_cents: 349, cost_cents: 180, tax_rate: 0, stock_quantity: 22, category: "Bakery", brand: "Metro Choice", unit: "unit", reorder_level: 8, shelf_location: "B2-01",
    batches: [{ batch_no: "SDL-D1", expiry_date: isoDaysFromNow(1), quantity: 22, cost_cents: 180 }] },
  { id: "p_croissant", name: "Butter Croissant", sku: "BAK-CRO", barcode: "8901200000022", price_cents: 175, cost_cents: 82, tax_rate: 0, stock_quantity: 40, category: "Bakery", brand: "Metro Choice", unit: "unit", reorder_level: 12, shelf_location: "B2-02",
    batches: [{ batch_no: "CRO-D1", expiry_date: isoDaysFromNow(1), quantity: 40, cost_cents: 82 }] },
  { id: "p_bagel", name: "Plain Bagels 4pk", sku: "BAK-BAG", barcode: "8901200000039", price_cents: 260, cost_cents: 145, tax_rate: 0, stock_quantity: 0, category: "Bakery", brand: "Metro Choice", unit: "pack", reorder_level: 6, shelf_location: "B2-03" },
  { id: "p_muffin", name: "Blueberry Muffin", sku: "BAK-MUF", barcode: "8901200000046", price_cents: 210, cost_cents: 95, tax_rate: 0, stock_quantity: 25, category: "Bakery", brand: "Metro Choice", unit: "unit", reorder_level: 8, shelf_location: "B2-04" },

  /* Dairy and eggs */
  { id: "p_milk_whole", name: "Whole Milk 2L", sku: "DAI-MLK", barcode: "8901300000018", price_cents: 259, cost_cents: 170, tax_rate: 0, stock_quantity: 96, category: "Dairy & Eggs", brand: "Daily Fresh", unit: "unit", reorder_level: 24, shelf_location: "C3-01",
    batches: [{ batch_no: "MLK-2404", expiry_date: isoDaysFromNow(7), quantity: 96, cost_cents: 170 }] },
  { id: "p_cheddar", name: "Mature Cheddar 400g", sku: "DAI-CHD", barcode: "8901300000025", price_cents: 549, cost_cents: 340, tax_rate: 0, stock_quantity: 31, category: "Dairy & Eggs", brand: "Daily Fresh", unit: "pack", reorder_level: 10, shelf_location: "C3-02",
    batches: [{ batch_no: "CHD-2405", expiry_date: isoDaysFromNow(45), quantity: 31, cost_cents: 340 }] },
  { id: "p_yogurt", name: "Greek Yogurt 500g", sku: "DAI-YOG", barcode: "8901300000032", price_cents: 329, cost_cents: 195, tax_rate: 0, stock_quantity: 4, category: "Dairy & Eggs", brand: "Daily Fresh", unit: "pack", reorder_level: 12, shelf_location: "C3-03",
    batches: [{ batch_no: "YOG-2403", expiry_date: isoDaysFromNow(9), quantity: 4, cost_cents: 195 }] },
  { id: "p_eggs", name: "Free Range Eggs 12pk", sku: "DAI-EGG", barcode: "8901300000049", price_cents: 419, cost_cents: 265, tax_rate: 0, stock_quantity: 58, category: "Dairy & Eggs", brand: "Harvest Hill", unit: "pack", reorder_level: 15, shelf_location: "C3-04",
    batches: [{ batch_no: "EGG-2406", expiry_date: isoDaysFromNow(18), quantity: 58, cost_cents: 265 }] },
  { id: "p_butter", name: "Salted Butter 250g", sku: "DAI-BUT", barcode: "8901300000056", price_cents: 289, cost_cents: 178, tax_rate: 0, stock_quantity: 44, category: "Dairy & Eggs", brand: "Daily Fresh", unit: "pack", reorder_level: 12, shelf_location: "C3-05" },

  /* Meat and seafood - weighted */
  { id: "p_chicken_breast", name: "Chicken Breast", sku: "MET-CHB", barcode: "8901400000011", price_cents: 899, cost_cents: 610, tax_rate: 0, stock_quantity: 27, category: "Meat & Seafood", brand: "Harvest Hill", unit: "kg", is_weighted: true, reorder_level: 10, shelf_location: "D4-01",
    batches: [{ batch_no: "CHB-2407", expiry_date: isoDaysFromNow(3), quantity: 27, cost_cents: 610 }] },
  { id: "p_beef_mince", name: "Beef Mince 20% Fat", sku: "MET-BFM", barcode: "8901400000028", price_cents: 1049, cost_cents: 720, tax_rate: 0, stock_quantity: 18, category: "Meat & Seafood", brand: "Harvest Hill", unit: "kg", is_weighted: true, reorder_level: 8, shelf_location: "D4-02",
    batches: [{ batch_no: "BFM-2408", expiry_date: isoDaysFromNow(2), quantity: 18, cost_cents: 720 }] },
  { id: "p_salmon", name: "Salmon Fillet", sku: "MET-SLM", barcode: "8901400000035", price_cents: 1899, cost_cents: 1290, tax_rate: 0, stock_quantity: 6, category: "Meat & Seafood", brand: "Swift Essentials", unit: "kg", is_weighted: true, reorder_level: 6, shelf_location: "D4-03",
    batches: [{ batch_no: "SLM-2409", expiry_date: isoDaysFromNow(1), quantity: 6, cost_cents: 1290 }] },

  /* Frozen */
  { id: "p_frozen_peas", name: "Garden Peas 1kg", sku: "FRZ-PEA", barcode: "8901500000014", price_cents: 199, cost_cents: 105, tax_rate: 0, stock_quantity: 73, category: "Frozen", brand: "Swift Essentials", unit: "pack", reorder_level: 20, shelf_location: "E5-01" },
  { id: "p_frozen_pizza", name: "Margherita Pizza", sku: "FRZ-PIZ", barcode: "8901500000021", price_cents: 449, cost_cents: 265, tax_rate: 0.05, stock_quantity: 38, category: "Frozen", brand: "Metro Choice", unit: "unit", reorder_level: 12, shelf_location: "E5-02",
    batches: [{ batch_no: "PIZ-2410", expiry_date: isoDaysFromNow(180), quantity: 38, cost_cents: 265 }] },
  { id: "p_ice_cream", name: "Vanilla Ice Cream 1L", sku: "FRZ-ICE", barcode: "8901500000038", price_cents: 549, cost_cents: 320, tax_rate: 0.05, stock_quantity: 3, category: "Frozen", brand: "Daily Fresh", unit: "unit", reorder_level: 10, shelf_location: "E5-03" },

  /* Beverages */
  { id: "p_still_water", name: "Still Water 6x500ml", sku: "BEV-WAT", barcode: "8901600000017", price_cents: 249, cost_cents: 120, tax_rate: 0, stock_quantity: 210, category: "Beverages", brand: "Swift Essentials", unit: "pack", reorder_level: 40, shelf_location: "F6-01" },
  { id: "p_orange_juice", name: "Orange Juice 1L", sku: "BEV-OJ", barcode: "8901600000024", price_cents: 299, cost_cents: 175, tax_rate: 0, stock_quantity: 47, category: "Beverages", brand: "Daily Fresh", unit: "unit", reorder_level: 15, shelf_location: "F6-02",
    batches: [{ batch_no: "OJ-2411", expiry_date: isoDaysFromNow(12), quantity: 47, cost_cents: 175 }] },
  { id: "p_cola", name: "Cola 2L", sku: "BEV-COL", barcode: "8901600000031", price_cents: 219, cost_cents: 115, tax_rate: 0.08, stock_quantity: 132, category: "Beverages", brand: "Metro Choice", unit: "unit", reorder_level: 30, shelf_location: "F6-03" },
  { id: "p_ground_coffee", name: "Ground Coffee 250g", sku: "BEV-COF", barcode: "8901600000048", price_cents: 649, cost_cents: 395, tax_rate: 0.08, stock_quantity: 29, category: "Beverages", brand: "Swift Essentials", unit: "pack", reorder_level: 10, shelf_location: "F6-04" },
  { id: "p_tea_bags", name: "Breakfast Tea 80 Bags", sku: "BEV-TEA", barcode: "8901600000055", price_cents: 379, cost_cents: 210, tax_rate: 0.08, stock_quantity: 51, category: "Beverages", brand: "Metro Choice", unit: "box", reorder_level: 15, shelf_location: "F6-05" },

  /* Pantry */
  { id: "p_basmati_rice", name: "Basmati Rice 5kg", sku: "PAN-RIC", barcode: "8901700000010", price_cents: 1149, cost_cents: 720, tax_rate: 0, stock_quantity: 34, category: "Pantry", brand: "Swift Essentials", unit: "pack", reorder_level: 10, shelf_location: "G7-01" },
  { id: "p_pasta", name: "Penne Pasta 500g", sku: "PAN-PAS", barcode: "8901700000027", price_cents: 149, cost_cents: 78, tax_rate: 0, stock_quantity: 118, category: "Pantry", brand: "Metro Choice", unit: "pack", reorder_level: 25, shelf_location: "G7-02" },
  { id: "p_olive_oil", name: "Olive Oil 1L", sku: "PAN-OIL", barcode: "8901700000034", price_cents: 899, cost_cents: 560, tax_rate: 0, stock_quantity: 26, category: "Pantry", brand: "Harvest Hill", unit: "unit", reorder_level: 8, shelf_location: "G7-03" },
  { id: "p_chopped_tomatoes", name: "Chopped Tomatoes 400g", sku: "PAN-CTM", barcode: "8901700000041", price_cents: 89, cost_cents: 42, tax_rate: 0, stock_quantity: 204, category: "Pantry", brand: "Metro Choice", unit: "unit", reorder_level: 40, shelf_location: "G7-04" },

  /* Snacks */
  { id: "p_potato_chips", name: "Salted Crisps 6pk", sku: "SNK-CHP", barcode: "8901800000013", price_cents: 259, cost_cents: 140, tax_rate: 0.08, stock_quantity: 88, category: "Snacks", brand: "Metro Choice", unit: "pack", reorder_level: 20, shelf_location: "H8-01" },
  { id: "p_choc_bar", name: "Milk Chocolate Bar", sku: "SNK-CHC", barcode: "8901800000020", price_cents: 129, cost_cents: 62, tax_rate: 0.08, stock_quantity: 2, category: "Snacks", brand: "Swift Essentials", unit: "unit", reorder_level: 25, shelf_location: "H8-02" },
  { id: "p_biscuits", name: "Digestive Biscuits 400g", sku: "SNK-BIS", barcode: "8901800000037", price_cents: 189, cost_cents: 96, tax_rate: 0.08, stock_quantity: 64, category: "Snacks", brand: "Metro Choice", unit: "pack", reorder_level: 18, shelf_location: "H8-03" },

  /* Household */
  { id: "p_dish_soap", name: "Dish Soap 750ml", sku: "HSE-DSH", barcode: "8901900000016", price_cents: 249, cost_cents: 128, tax_rate: 0.08, stock_quantity: 57, category: "Household", brand: "Swift Essentials", unit: "unit", reorder_level: 15, shelf_location: "I9-01" },
  { id: "p_toilet_roll", name: "Toilet Roll 9pk", sku: "HSE-TRL", barcode: "8901900000023", price_cents: 599, cost_cents: 340, tax_rate: 0.08, stock_quantity: 41, category: "Household", brand: "Metro Choice", unit: "pack", reorder_level: 12, shelf_location: "I9-02" },
  { id: "p_bin_bags", name: "Bin Bags 30pk", sku: "HSE-BIN", barcode: "8901900000030", price_cents: 329, cost_cents: 175, tax_rate: 0.08, stock_quantity: 5, category: "Household", brand: "Swift Essentials", unit: "pack", reorder_level: 10, shelf_location: "I9-03" },
];

interface MockAccount {
  password: string;
  user: AuthUser;
}

interface MockApiState {
  products: Product[];
  syncedOrderIds: string[];
  /*
   * The stored sales GET /orders reads back. Kept alongside syncedOrderIds
   * rather than replacing it: that array is the idempotency check, and an
   * order can be replayed after this list has been filtered or trimmed.
   */
  orders: ServerOrder[];
  /*
   * Passwords are stored in cleartext because this is a browser-only fake
   * with no security boundary. The real backend hashes server-side; nothing
   * here should ever be reused as a template for that.
   */
  accounts: Record<string, MockAccount>;
  resetTokens: Record<string, { email: string; expiresAt: number }>;
  currentEmail: string | null;
}

function defaultState(): MockApiState {
  return {
    products: structuredClone(DEFAULT_PRODUCTS),
    syncedOrderIds: [],
    orders: [],
    accounts: {},
    resetTokens: {},
    currentEmail: null,
  };
}

function isMockApiState(value: unknown): value is MockApiState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.products) && Array.isArray(candidate.syncedOrderIds);
}

/**
 * In-memory + localStorage-backed state, separate from the real IndexedDB
 * offline store. This only simulates a persistent backend for frontend dev;
 * it is lazily loaded so importing this module is safe during SSR/build.
 */
let state: MockApiState | null = null;

function getState(): MockApiState {
  if (state) return state;

  if (typeof window === "undefined") {
    state = defaultState();
    return state;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    /*
     * Blobs written before the auth fields existed still validate, so merge
     * over the defaults rather than assuming every key is present.
     */
    state = isMockApiState(parsed)
      ? { ...defaultState(), ...parsed }
      : defaultState();
  } catch {
    state = defaultState();
  }
  return state;
}

function saveState() {
  if (typeof window === "undefined" || !state) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function encodeBase64Url(value: string): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(value)
      : Buffer.from(value, "utf-8").toString("base64");
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/={1,2}$/, "");
}

function makeFakeJwt(user: AuthUser): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({ sub: user.id, email: user.email, exp: Date.now() + 3_600_000 }),
  );
  return `${header}.${payload}.mock-signature`;
}

let syncDelayMs = DEFAULT_SYNC_DELAY_MS;
let forcedSyncResult: SyncOrderResult | null = null;

/* Test/demo hooks - not part of the ApiClient contract, so realApi has no equivalent. */
function setSyncDelay(ms: number) {
  syncDelayMs = ms;
}

/* Forces every order in the *next* syncOrders() call to this result, then resets. */
function setNextSyncResult(result: SyncOrderResult | null) {
  forcedSyncResult = result;
}

/**
 * Mirrors what the real backend stores: the till's figures verbatim, plus a
 * server-side subtotal derived from them. There is no independent recompute
 * here, so totals_mismatch is always false — the mock cannot disagree with a
 * client it does not re-add.
 */
function toServerOrder(order: PendingOrder, serverID: string): ServerOrder {
  const discountCents = order.discount_cents ?? 0;
  return {
    id: serverID,
    client_generated_id: order.client_generated_id,
    receipt_no: order.receipt_no ?? null,
    payment_method: order.payment_method,
    subtotal_cents: order.total_cents - order.tax_total_cents,
    discount_cents: discountCents,
    tax_total_cents: order.tax_total_cents,
    total_cents: order.total_cents,
    /*
     * Refunds are a local annotation with no endpoint behind them, so a synced
     * order is never refunded server-side.
     */
    refunded: false,
    totals_mismatch: false,
    ...(order.cashier_id ? { cashier_id: order.cashier_id } : {}),
    /*
     * The till's own clock, preserved as the business date — an order synced
     * days late must not be booked today.
     */
    sold_at: order.created_at,
    synced_at: Date.now(),
    items: order.items.map((item) => ({
      product_id: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      tax_rate: item.tax_rate,
      ...(item.unit ? { unit: item.unit } : {}),
      ...(item.is_weighted ? { is_weighted: item.is_weighted } : {}),
      line_discount_cents: item.line_discount_cents ?? 0,
    })),
    payments: order.payments ?? [],
  };
}

function resolveOrderResult(order: PendingOrder, apiState: MockApiState): SyncOrderOutcome {
  if (forcedSyncResult) {
    return { client_generated_id: order.client_generated_id, result: forcedSyncResult };
  }

  if (apiState.syncedOrderIds.includes(order.client_generated_id)) {
    return { client_generated_id: order.client_generated_id, result: "already_synced" };
  }

  const serverID = `srv_${order.client_generated_id}`;
  apiState.syncedOrderIds.push(order.client_generated_id);
  apiState.orders.push(toServerOrder(order, serverID));
  return {
    client_generated_id: order.client_generated_id,
    result: "synced",
    server_id: serverID,
  };
}

/**
 * Same filter/sort/page semantics as the Go handler, so switching
 * NEXT_PUBLIC_USE_MOCK_API does not change what the sales screen renders.
 */
const MOCK_DEFAULT_PER_PAGE = 20;
const MOCK_MAX_PER_PAGE = 100;

function matchesSearch(order: ServerOrder, needle: string): boolean {
  return (
    (order.receipt_no ?? "").toLowerCase().includes(needle) ||
    order.client_generated_id.toLowerCase().includes(needle) ||
    order.items.some((item) => item.name.toLowerCase().includes(needle))
  );
}

function sortValue(order: ServerOrder, sort: OrderListParams["sort"]): number {
  switch (sort) {
    case "total_cents":
      return order.total_cents;
    case "synced_at":
      return order.synced_at;
    default:
      return order.sold_at;
  }
}

/**
 * In-memory fake with simulated latency + configurable test scenarios. Used
 * when NEXT_PUBLIC_USE_MOCK_API is not explicitly "false".
 */
export const mockApi: ApiClient & {
  setSyncDelay: typeof setSyncDelay;
  setNextSyncResult: typeof setNextSyncResult;
} = {
  async login(email: string, password: string): Promise<LoginResult> {
    await delay(200);
    if (!email || !password) {
      throw new Error("email and password are required");
    }

    const apiState = getState();
    const key = email.trim().toLowerCase();
    const existing = apiState.accounts[key];

    if (existing) {
      if (existing.password !== password) {
        throw new Error("Invalid email or password");
      }
      apiState.currentEmail = key;
      saveState();
      return { token: makeFakeJwt(existing.user), user: existing.user };
    }

    /**
     * No account yet: the fake backend self-registers on first sign-in so a
     * fresh dev environment doesn't require a separate seeding step. The real
     * backend rejects unknown accounts instead.
     */
    const user: AuthUser = {
      id: `user_${encodeBase64Url(key).slice(0, 12)}`,
      email,
      name: email.split("@")[0],
      businessName: "Demo Business",
      businessType: "grocery",
    };
    apiState.accounts[key] = { password, user };
    apiState.currentEmail = key;
    saveState();
    return { token: makeFakeJwt(user), user };
  },

  async requestPasswordReset(email: string): Promise<{ devToken?: string }> {
    await delay(300);
    const apiState = getState();
    const key = email.trim().toLowerCase();
    /*
     * Resolve identically whether or not the account exists — a differing
     * response would let a caller enumerate registered addresses.
     */
    if (!apiState.accounts[key]) return {};

    const token = crypto.randomUUID().replaceAll("-", "").slice(0, 24);
    apiState.resetTokens[token] = {
      email: key,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    saveState();
    return { devToken: token };
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await delay(300);
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const apiState = getState();
    const entry = apiState.resetTokens[token];
    if (!entry || entry.expiresAt < Date.now()) {
      throw new Error("This reset link is invalid or has expired");
    }
    const account = apiState.accounts[entry.email];
    if (!account) throw new Error("This reset link is invalid or has expired");

    account.password = newPassword;
    /* Single-use: burn the token so a leaked link can't be replayed. */
    delete apiState.resetTokens[token];
    saveState();
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await delay(300);
    if (newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    const apiState = getState();
    const account = apiState.currentEmail
      ? apiState.accounts[apiState.currentEmail]
      : undefined;
    if (!account) throw new Error("You are not signed in");
    if (account.password !== currentPassword) {
      throw new Error("Current password is incorrect");
    }
    account.password = newPassword;
    saveState();
  },

  async updateProfile(update: ProfileUpdate): Promise<AuthUser> {
    await delay(250);
    const apiState = getState();
    const account = apiState.currentEmail
      ? apiState.accounts[apiState.currentEmail]
      : undefined;
    if (!account) throw new Error("You are not signed in");

    const nextUser: AuthUser = {
      ...account.user,
      ...(update.name ? { name: update.name } : {}),
      ...(update.email ? { email: update.email } : {}),
      ...(update.businessName ? { businessName: update.businessName } : {}),
    };

    /* Re-key the account when the address changes so the next sign-in finds it. */
    const nextKey = nextUser.email.trim().toLowerCase();
    if (nextKey !== apiState.currentEmail) {
      delete apiState.accounts[apiState.currentEmail!];
      apiState.currentEmail = nextKey;
    }
    apiState.accounts[nextKey] = { ...account, user: nextUser };
    saveState();
    return nextUser;
  },

  async register(
    ownerName: string,
    businessName: string,
    email: string,
    password: string,
    businessType: string,
  ): Promise<LoginResult> {
    await delay(200);
    if (!ownerName || !businessName || !email || !password || !businessType) {
      throw new Error("owner name, business name, business type, email and password are required");
    }
    const apiState = getState();
    const key = email.trim().toLowerCase();
    if (apiState.accounts[key]) {
      throw new Error("An account with that email already exists");
    }

    const user: AuthUser = {
      id: `user_${encodeBase64Url(key).slice(0, 12)}`,
      email,
      name: ownerName,
      businessName,
      businessType,
    };
    apiState.accounts[key] = { password, user };
    apiState.currentEmail = key;
    saveState();
    return { token: makeFakeJwt(user), user };
  },

  async getProducts(): Promise<Product[]> {
    await delay(150);
    return structuredClone(getState().products);
  },

  /*
   * Mirrors the real endpoint's idempotency: the product carries the id the
   * till assigned it, so a replayed push returns the stored copy instead of
   * adding a duplicate. A clash on SKU or barcode with a *different* product is
   * the one case that fails, and it fails permanently.
   */
  async createProduct(product: Product): Promise<Product> {
    await delay(150);
    const apiState = getState();

    const stored = apiState.products.find((p) => p.id === product.id);
    if (stored) return structuredClone(stored);

    const clash = apiState.products.find(
      (p) => p.sku === product.sku || p.barcode === product.barcode,
    );
    if (clash) {
      throw new Error(
        clash.sku === product.sku
          ? "a product with this SKU already exists"
          : "a product with this barcode already exists",
      );
    }

    const saved = structuredClone(product);
    delete saved._local_only;
    delete saved._pending_update;
    apiState.products.push(saved);
    saveState();
    return structuredClone(saved);
  },

  /*
   * Replaces the catalogue fields, keeping the server's stock and batches — the
   * same carve-out the real endpoint makes, so a stale local stock figure gets
   * dropped here too rather than only in production.
   */
  async updateProduct(product: Product): Promise<Product> {
    await delay(150);
    const apiState = getState();

    const index = apiState.products.findIndex((p) => p.id === product.id);
    if (index === -1) throw new Error("product not found");

    const clash = apiState.products.find(
      (p) =>
        p.id !== product.id &&
        (p.sku === product.sku || p.barcode === product.barcode),
    );
    if (clash) {
      throw new Error(
        clash.sku === product.sku
          ? "a product with this SKU already exists"
          : "a product with this barcode already exists",
      );
    }

    const stored = apiState.products[index];
    const saved = structuredClone(product);
    delete saved._local_only;
    delete saved._pending_update;
    saved.stock_quantity = stored.stock_quantity;
    saved.batches = stored.batches;

    apiState.products[index] = saved;
    saveState();
    return structuredClone(saved);
  },

  async deleteProduct(id: string): Promise<void> {
    await delay(150);
    const apiState = getState();
    apiState.products = apiState.products.filter((p) => p.id !== id);
    saveState();
  },

  async syncOrders(orders: PendingOrder[]): Promise<SyncOrdersResponse> {
    await delay(syncDelayMs);
    const apiState = getState();
    const results = orders.map((order) => resolveOrderResult(order, apiState));
    forcedSyncResult = null;
    saveState();
    return { results };
  },

  async getOrders(params: OrderListParams = {}): Promise<OrderPage> {
    await delay(120);
    const apiState = getState();

    const needle = params.search?.trim().toLowerCase() ?? "";
    const filtered = apiState.orders.filter((order) => {
      if (params.payment_method && order.payment_method !== params.payment_method) {
        return false;
      }
      if (params.from !== undefined && order.sold_at < params.from) return false;
      if (params.to !== undefined && order.sold_at > params.to) return false;
      if (needle && !matchesSearch(order, needle)) return false;
      return true;
    });

    const direction = params.order === "asc" ? 1 : -1;
    filtered.sort(
      (a, b) =>
        direction * (sortValue(a, params.sort) - sortValue(b, params.sort)),
    );

    const perPage = Math.min(
      Math.max(params.per_page ?? MOCK_DEFAULT_PER_PAGE, 1),
      MOCK_MAX_PER_PAGE,
    );
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Math.max(params.page ?? 1, 1), totalPages);
    const offset = (page - 1) * perPage;

    return {
      orders: structuredClone(filtered.slice(offset, offset + perPage)),
      meta: {
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  },

  setSyncDelay,
  setNextSyncResult,
};
