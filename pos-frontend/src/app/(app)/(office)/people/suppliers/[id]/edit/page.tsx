"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupplier, updateSupplier } from "@/lib/db";
import type { Supplier } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ROUTES } from "@/lib/types/routes";

function RequiredMark() {
  return (
    <span className="ml-1 text-error" aria-hidden>
      *
    </span>
  );
}

export default function EditSupplierPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = use(params);
  const router = useRouter();
  const { showToast } = useToast();
  const [supplier, setSupplier] = useState<Supplier | null | undefined>(undefined);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSupplier(id).then((found) => {
      setSupplier(found ?? null);
      if (found) {
        setName(found.name);
        setContactName(found.contact_name ?? "");
        setPhone(found.phone ?? "");
        setEmail(found.email ?? "");
        setCity(found.city ?? "");
        setAddress(found.address ?? "");
        setTaxNumber(found.tax_number ?? "");
        setPaymentTerms(found.payment_terms ?? "");
      }
    });
  }, [id]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateSupplier(id, {
        name: name.trim(),
        contact_name: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
      });
      showToast(`${name.trim()} updated`, "success");
      router.push(ROUTES.suppliers);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save supplier",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <PageHeader
        title="Edit"
        breadcrumbs={[
          { label: "Suppliers", href: ROUTES.suppliers },
          { label: "Edit" },
        ]}
      />

      <Card>
        {supplier === undefined && (
          <p className="text-sm text-on-surface-variant dark:text-zinc-400">Loading…</p>
        )}
        {supplier === null && (
          <p className="text-sm text-on-surface-variant dark:text-zinc-400">
            Supplier not found.
          </p>
        )}
        {supplier && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={
                  <>
                    Name
                    <RequiredMark />
                  </>
                }
                placeholder="Name"
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                label="Contact Name"
                placeholder="Contact Name"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone"
                placeholder="Phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <Input
                label="Email"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="City"
                placeholder="City"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
              <Input
                label="Tax Number"
                placeholder="Tax Number"
                value={taxNumber}
                onChange={(event) => setTaxNumber(event.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Payment Terms"
                placeholder="e.g. Net 30"
                value={paymentTerms}
                onChange={(event) => setPaymentTerms(event.target.value)}
              />
              <Input
                label="Address"
                placeholder="Address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>

            {error && <p className="text-xs text-error">{error}</p>}

            <div className="flex items-center gap-2">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push(ROUTES.suppliers)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
