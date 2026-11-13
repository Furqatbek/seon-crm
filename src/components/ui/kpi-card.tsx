import * as React from "react";

import { cn } from "@/lib/utils";

/** Footnote label above a Title-size number. The number is never cut off. */
function KpiCard({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="kpi-card"
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-card border border-border bg-bg p-4",
        className,
      )}
    >
      <span className="truncate text-footnote text-text-secondary">{label}</span>
      <span className="text-title text-text numeric">{children}</span>
    </div>
  );
}

export { KpiCard };
