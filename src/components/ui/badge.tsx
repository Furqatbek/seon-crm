import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Pill in Caption. Status colours are a 10 % tint with the full colour as text.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-caption whitespace-nowrap [&>svg]:size-3.5",
  {
    variants: {
      tone: {
        neutral: "bg-bg-subtle text-text-secondary",
        purple: "bg-purple-tint text-purple",
        success: "bg-success-tint text-success",
        warning: "bg-warning-tint text-warning",
        danger: "bg-danger-tint text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
