"use client";

import { useEffect, useState } from "react";
import type { ProvinceTaxData } from "@/app/api/admin/province-tax/route";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GeoCardSkeleton } from "@/components/admin/loading-skeletons";
import { MapPin } from "lucide-react";

export function ProvinceTaxMap() {
  const [data, setData] = useState<ProvinceTaxData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/province-tax")
      .then((response) => (response.ok ? response.json() as Promise<ProvinceTaxData> : null))
      .then((result) => setData(result))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <GeoCardSkeleton />;

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          Tax Distribution by Province
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground" role="status">
          {data?.reason ?? "Provincial tax data is unavailable."}
        </p>
      </CardContent>
    </Card>
  );
}
