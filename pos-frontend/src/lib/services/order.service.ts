import { httpClient, type HttpClient } from "./http-client";
import type { SyncOrdersResponse } from "@/lib/api/client";
import type { OrderListParams, OrderPage, PendingOrder } from "@/lib/types";

/**
 * Only the params the caller actually set are sent. An explicit `page=0` or
 * `search=` would be parsed by the server and clamped or matched, so omitting
 * them is what lets the server's own defaults apply.
 */
function toQueryString(params: OrderListParams): string {
  const query = new URLSearchParams();

  /**
   * Written out field by field rather than iterating Object.entries: the entries
   * of a typed object widen to unknown, and an unset key must stay out of the
   * URL entirely rather than being sent as "undefined".
   */
  const set = (key: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    query.set(key, typeof value === "number" ? value.toString() : value);
  };

  set("page", params.page);
  set("per_page", params.per_page);
  set("search", params.search);
  set("payment_method", params.payment_method);
  set("from", params.from);
  set("to", params.to);
  set("sort", params.sort);
  set("order", params.order);

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export class OrderService {
  constructor(private readonly http: HttpClient) {}

  syncOrders(orders: PendingOrder[]): Promise<SyncOrdersResponse> {
    return this.http.request<SyncOrdersResponse>("/orders/sync", {
      method: "POST",
      body: { orders },
    });
  }

  getOrders(params: OrderListParams = {}): Promise<OrderPage> {
    return this.http.request<OrderPage>(`/orders${toQueryString(params)}`);
  }
}

export const orderService = new OrderService(httpClient);
