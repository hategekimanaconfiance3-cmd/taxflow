"use client";

import { useState } from "react";
import { Search, PackageSearch, ArrowRight } from "lucide-react";

type ProductOption = { id: string; name: string; unit: string };

export function ProductJourneyExplorer({
  products,
  selectedProductId,
}: {
  products: ProductOption[];
  selectedProductId: string;
}) {
  const [query, setQuery] = useState("");
  const filtered = products.filter((product) =>
    `${product.name} ${product.unit} ${product.id}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <form action="/admin/product-journey" method="get" className="rounded-xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <label htmlFor="product-search" className="text-sm font-medium">Find product</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="product-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by product name or unit…"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filter product options"
            />
          </div>
          <select
            name="productId"
            defaultValue={selectedProductId}
            required
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            aria-label="Select product to trace"
          >
            <option value="">Select a product…</option>
            {filtered.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.unit}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {products.length} products available to authorized RRA staff.
          </p>
        </div>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">
          <PackageSearch className="h-4 w-4" />
          Trace product
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
