"use client";

import { Button, type buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VariantProps } from "class-variance-authority";

/**
 * An action that is shown but not available yet. A disabled button gets no
 * hover or focus, so the wrapper carries the tooltip that says why.
 */
export function SoonButton({
  hint,
  variant,
  children,
  className,
}: {
  hint: string;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex rounded-control outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
        >
          <Button variant={variant} disabled aria-description={hint} className={className}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
