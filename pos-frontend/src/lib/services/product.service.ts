import { ApiError, httpClient, type HttpClient } from "./http-client";
import type { Product } from "@/lib/types";

/**
 * Fields the server owns or refuses in a write body. `_local_only` and
 * `_pending_update` are client bookkeeping with no column behind them;
 * `stock_quantity` and `batches` are server-owned on update (see the endpoint's
 * contract) and are dropped so a stale local figure cannot be offered at all.
 */
type WritableProduct = Omit<
  Product,
  "_local_only" | "_pending_update" | "stock_quantity" | "batches"
>;

function toUpdateBody(product: Product): WritableProduct {
  const body = { ...product };
  delete body._local_only;
  delete body._pending_update;
  delete (body as Partial<Product>).stock_quantity;
  delete body.batches;
  return body;
}

export class ProductService {
  constructor(private readonly http: HttpClient) {}

  getProducts(): Promise<Product[]> {
    return this.http.request<Product[]>("/products");
  }

  /**
   * `_local_only` and `_pending_update` are client-side bookkeeping with no
   * column behind them, so they are stripped rather than sent and ignored.
   * `stock_quantity` and `batches` stay: on create the client's figures are the
   * only ones there are.
   */
  createProduct(product: Product): Promise<Product> {
    const body = { ...product };
    delete body._local_only;
    delete body._pending_update;
    return this.http.request<Product>("/products", { method: "POST", body });
  }

  updateProduct(product: Product): Promise<Product> {
    return this.http.request<Product>(`/products/${product.id}`, {
      method: "PUT",
      body: toUpdateBody(product),
    });
  }

  /**
   * A 404 is success: the product is gone, which is the whole point of the
   * call. Anything else propagates so the sync manager retries.
   */
  async deleteProduct(id: string): Promise<void> {
    try {
      await this.http.request<void>(`/products/${id}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return;
      throw error;
    }
  }
}

export const productService = new ProductService(httpClient);
