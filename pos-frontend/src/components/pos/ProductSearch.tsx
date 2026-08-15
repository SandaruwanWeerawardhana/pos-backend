"use client";

import { useEffect, useState } from "react";
import { searchProducts } from "@/lib/db";
import type { Product } from "@/lib/types";
import { Input } from "@/components/ui/Input";

type ProductSearchProps = Readonly<{
  onResults: (products: Product[]) => void;
}>;

export function ProductSearch({ onResults }: ProductSearchProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      searchProducts(query).then(onResults);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, onResults]);

  return (
    <Input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder="Search by name, SKU, or barcode…"
      autoFocus
      pill
    />
  );
}
