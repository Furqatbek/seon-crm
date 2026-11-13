import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";

/**
 * A status as a pill. The label always carries the meaning; the colour only
 * reinforces it, so the pill still reads in greyscale.
 */
function StatusPill({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge data-slot="status-pill" tone={tone} className={className}>
      {Icon ? <Icon aria-hidden /> : null}
      {children}
    </Badge>
  );
}

export { StatusPill };
