"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer } from "@/lib/db";
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

export default function CreateCustomerPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [address, setAddress] = useState("");
  const [royaltyEligible, setRoyaltyEligible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!firstName.trim()) {
      setError("First name is required");
      return;
    }
    if (!lastName.trim()) {
      setError("Last name is required");
      return;
    }
    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const openingBalanceCents = openingBalance.trim()
        ? Math.round(Number(openingBalance) * 100)
        : undefined;
      const creditLimitCents = creditLimit.trim() ? Math.round(Number(creditLimit) * 100) : 0;
      await createCustomer({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        country: country.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zip: zip.trim() || undefined,
        tax_number: taxNumber.trim() || undefined,
        address: address.trim() || undefined,
        opening_balance_cents: openingBalanceCents,
        credit_limit_cents: creditLimitCents > 0 ? creditLimitCents : undefined,
        royalty_eligible: royaltyEligible,
      });
      showToast(`${firstName.trim()} ${lastName.trim()} added`, "success");
      router.push(ROUTES.people.root);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not save customer",
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
          { label: "Customers", href: ROUTES.people.root },
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
                  First Name
                  <RequiredMark />
                </>
              }
              placeholder="First Name"
              autoFocus
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
            <Input
              label={
                <>
                  Last Name
                  <RequiredMark />
                </>
              }
              placeholder="Last Name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={
                <>
                  Username
                  <RequiredMark />
                </>
              }
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Input
              label={
                <>
                  Email
                  <RequiredMark />
                </>
              }
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
              label="State"
              placeholder="State"
              value={state}
              onChange={(event) => setState(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Zip"
              placeholder="Zip"
              value={zip}
              onChange={(event) => setZip(event.target.value)}
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
              hint="Enter the customer's previous outstanding balance from before system start"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.target.value)}
            />
            <Input
              label="Credit Limit"
              hint="Maximum credit amount allowed for this customer. (0 means No limit)"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
            />
          </div>

          <Input
            label="Address"
            placeholder="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />

          <label className="flex items-center gap-2 text-sm text-on-surface dark:text-zinc-100">
            <input
              type="checkbox"
              checked={royaltyEligible}
              onChange={(event) => setRoyaltyEligible(event.target.checked)}
              className="h-4 w-4 cursor-pointer accent-primary"
            /> Is royalty eligible
          </label>

          {error && <p className="text-xs text-error">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" loading={saving}>
              Submit
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(ROUTES.people.root)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
