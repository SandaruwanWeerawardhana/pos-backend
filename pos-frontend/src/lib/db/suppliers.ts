import { db } from "./index";
import type { Supplier } from "@/lib/types";

// Local-only table, no server sync yet (no backend endpoint exists).

export async function listSuppliers(): Promise<Supplier[]> {
  return db.suppliers.orderBy("name").toArray();
}

export async function getSupplier(id: string): Promise<Supplier | undefined> {
  return db.suppliers.get(id);
}

async function nextSupplierCode(): Promise<string> {
  const suppliers = await db.suppliers.toArray();
  const highest = suppliers.reduce((max, supplier) => {
    const value = Number(supplier.code);
    return Number.isFinite(value) && value > max ? value : max;
  }, 100);
  return String(highest + 1);
}

export interface CreateSupplierInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  address?: string;
  tax_number?: string;
  payment_terms?: string;
  opening_balance_cents?: number;
  credit_limit_cents?: number;
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const supplier: Supplier = {
    ...input,
    id: crypto.randomUUID(),
    code: await nextSupplierCode(),
    opening_balance_cents: input.opening_balance_cents ?? 0,
    total_purchase_due_cents: 0,
    total_purchase_return_due_cents: 0,
    created_at: Date.now(),
  };
  await db.suppliers.add(supplier);
  return supplier;
}

export async function updateSupplier(
  id: string,
  changes: Partial<Omit<Supplier, "id" | "code" | "created_at">>,
): Promise<void> {
  await db.suppliers.update(id, changes);
}

export async function deleteSupplier(id: string): Promise<void> {
  await db.suppliers.delete(id);
}
