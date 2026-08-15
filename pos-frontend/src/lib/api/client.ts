import type {
  OrderListParams,
  OrderPage,
  PendingOrder,
  Product,
} from "@/lib/types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  businessName: string;
  businessType: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  businessName?: string;
}

export type SyncOrderResult = "synced" | "already_synced" | "conflict" | "error";

export interface SyncOrderOutcome {
  client_generated_id: string;
  result: SyncOrderResult;
  server_id?: string;
}

export interface SyncOrdersResponse {
  results: SyncOrderOutcome[];
}

/* Contract shared by the real (HTTP, Go backend) and mock API clients. */
export interface ApiClient {
  login(email: string, password: string): Promise<LoginResult>;
  register(
    ownerName: string,
    businessName: string,
    email: string,
    password: string,
    businessType: string,
  ): Promise<LoginResult>;
  /*
   * Always resolves, even for an unknown address: telling a caller whether an
   * email is registered is an account-enumeration leak. The returned token is
   * the dev-mode convenience the mock backend hands back so the reset screen
   * can be exercised without a mail server; the real backend returns none.
   */
  requestPasswordReset(email: string): Promise<{ devToken?: string }>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  updateProfile(update: ProfileUpdate): Promise<AuthUser>;
  getProducts(): Promise<Product[]>;
  /*
   * Pushes a product created offline. The product carries the id the till
   * assigned it, so replaying a push whose response was lost returns the stored
   * product rather than creating a second one. Returns the server's canonical
   * copy, which the caller writes back over the local row.
   */
  createProduct(product: Product): Promise<Product>;
  /*
   * Replaces a product's catalogue fields. Stock and batches are owned by the
   * server and are not part of the request, so the returned product is the
   * authoritative copy the caller writes back over its local row.
   */
  updateProduct(product: Product): Promise<Product>;
  /*
   * Deletes a product server-side. Resolves for a product the server does not
   * have: the outcome the caller wants is "gone", and a 404 means it already is.
   */
  deleteProduct(id: string): Promise<void>;
  syncOrders(orders: PendingOrder[]): Promise<SyncOrdersResponse>;
  /*
   * Reads stored sales back. Paginated, unlike getProducts: the catalogue is
   * bounded and cached whole for offline selling, but sales history only grows.
   *
   * This is the server's copy, so it only contains sales that have synced. The
   * sales screen overlays its own unsynced local orders on top — see
   * useSalesFeed — rather than treating this as the complete picture.
   */
  getOrders(params?: OrderListParams): Promise<OrderPage>;
}
