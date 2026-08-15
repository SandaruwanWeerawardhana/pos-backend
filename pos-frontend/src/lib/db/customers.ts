import { db } from "./index";
import type { Customer } from "@/lib/types";

/* Local-only table, no server sync yet (no backend endpoint exists). */

export async function listCustomers(): Promise<Customer[]> {
  return db.customers.orderBy("name").toArray();
}

export async function getCustomer(id: string): Promise<Customer | undefined> {
  return db.customers.get(id);
}

async function nextCustomerCode(): Promise<string> {
  const customers = await db.customers.toArray();
  const highest = customers.reduce((max, customer) => {
    const value = Number(customer.code);
    return Number.isFinite(value) && value > max ? value : max;
  }, 100);
  return String(highest + 1);
}

export interface CreateCustomerInput {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone?: string;
  country?: string;
  city?: string;
  state?: string;
  zip?: string;
  tax_number?: string;
  address?: string;
  opening_balance_cents?: number;
  credit_limit_cents?: number;
  royalty_eligible?: boolean;
}

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const customer: Customer = {
    ...input,
    id: crypto.randomUUID(),
    code: await nextCustomerCode(),
    name: `${input.first_name} ${input.last_name}`.trim(),
    points: 0,
    opening_balance_cents: input.opening_balance_cents ?? 0,
    total_sale_due_cents: 0,
    total_sell_return_due_cents: 0,
    royalty_eligible: input.royalty_eligible ?? false,
    created_at: Date.now(),
  };
  await db.customers.add(customer);
  return customer;
}

export async function updateCustomer(
  id: string,
  changes: Partial<Omit<Customer, "id" | "code" | "created_at">>,
): Promise<void> {
  await db.customers.update(id, changes);
}

export async function deleteCustomer(id: string): Promise<void> {
  await db.customers.delete(id);
}
