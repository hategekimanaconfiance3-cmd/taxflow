"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PlatformHealthRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
