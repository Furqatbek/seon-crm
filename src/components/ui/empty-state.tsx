import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** One outline icon, one sentence, one button. */
function EmptyState({
  icon: Icon,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-card border border-border px-6 py-16 text-center",
        className,
      )}
    >
      <Icon className="size-8 text-text-secondary" aria-hidden />
      <p className="max-w-sm text-body text-text-secondary">{children}</p>
      {action}
    </div>
  );
}

export { EmptyState };
