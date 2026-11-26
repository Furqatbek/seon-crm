import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";

/** A number of coins with the coin icon; the caller names it for a screen reader. */
export function CoinsText({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap numeric", className)} data-coins={value}>
      <Coins className="size-4 text-warning" aria-hidden />
      <span aria-hidden>{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
