"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AnomalyFiltersProps {
  currentSeverity?: string;
  currentCategory?: string;
}

export default function AnomalyFilters({ currentSeverity, currentCategory }: AnomalyFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || params.get(key) === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const severities = [
    { label: "All", value: null },
    { label: "Critical", value: "critical" },
    { label: "Warning", value: "warning" },
  ];

  const categories = [
    { label: "All", value: null },
    { label: "Transaction", value: "transaction" },
    { label: "Stock", value: "stock" },
    { label: "AI Risk", value: "ai_risk" },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium mr-1">Severity:</span>
        {severities.map(({ label, value }) => (
          <Button
            key={label}
            size="sm"
            variant={currentSeverity === value || (value === null && !currentSeverity) ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => update("severity", value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground font-medium mr-1">Category:</span>
        {categories.map(({ label, value }) => (
          <Button
            key={label}
            size="sm"
            variant={currentCategory === value || (value === null && !currentCategory) ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => update("category", value)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
