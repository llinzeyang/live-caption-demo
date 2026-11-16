"use client";

import { useEffect, type ReactNode } from "react";

import "@/src/pricing.css";

export function PricingDesk({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("pricing-page");
    let cancelled = false;
    void import("@/src/pricing/main").then((mod) => {
      if (!cancelled) mod.bootstrapPricingDesk();
    });
    return () => {
      cancelled = true;
      document.body.classList.remove("pricing-page");
    };
  }, []);

  return children;
}
