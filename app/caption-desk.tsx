"use client";

import { useEffect, type ReactNode } from "react";

import "@/src/style.css";

export function CaptionDesk({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    void import("@/src/main").then((mod) => {
      if (!cancelled) mod.bootstrapCaptionDesk();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return children;
}
