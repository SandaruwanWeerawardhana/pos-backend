"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createSupplier } from "@/lib/db";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
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

export default function CreateSupplierPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Supplier name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const openingBalanceCents = openingBalance.trim()
        ? Math.round(Number(openingBalance) * 100)
        : undefined;
      const creditLimitCents = creditLimit.trim() ? Math.round(Number(creditLimit) * 100) : 0;
      await createSupplier({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        city: city.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
        opening_balance_cents: openingBalanceCents,
        credit_limit_cents: creditLimitCents > 0 ? creditLimitCents : undefined,
        address: address.trim() || undefined,
      });
      showToast(`${name.trim()} added`, "success");
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
        title="Create"
        breadcrumbs={[
          { label: "Suppliers", href: ROUTES.suppliers },
          { label: "Create" },
        ]}
      />

      <Card>
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
                  Supplier Name
                  <RequiredMark />
                </>
              }
              placeholder="Supplier Name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              label="Phone"
              placeholder="Phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <Input
              label="Country"
              placeholder="Country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
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
              label="Opening Balance (Previous Dues)"
              hint="Enter the supplier's previous outstanding balance from before system start"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
            <Input
              label="Credit Limit"
              hint="Maximum credit amount allowed for this supplier. (0 means No limit)"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
            />
          </div>

          <Textarea
            label="Address"
            placeholder="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" loading={saving}>
              <Check size={16} />
              Submit
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(ROUTES.suppliers)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
