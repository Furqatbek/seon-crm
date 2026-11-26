"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** The colour of a segment when it is the chosen one. */
export type SegmentTone = "brand" | "success" | "warning" | "danger" | "neutral";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  /** Brand orange unless the choice has a meaning of its own (came, late, absent). */
  tone?: SegmentTone;
};

// The chosen segment stands out by a coloured border and coloured, heavier
// text on the page's own background, in light and in dark.
const CHOSEN: Record<SegmentTone, string> = {
  brand: "data-[state=checked]:border-brand data-[state=checked]:text-brand-ink",
  success: "data-[state=checked]:border-success data-[state=checked]:text-success",
  warning: "data-[state=checked]:border-warning data-[state=checked]:text-warning",
  danger: "data-[state=checked]:border-danger data-[state=checked]:text-danger",
  neutral: "data-[state=checked]:border-text-secondary data-[state=checked]:text-text",
};

/** Apple-style segmented control for view switches (Board / List). */
function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  fullWidth = false,
  disabled,
  "aria-label": ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="segmented-control"
      orientation="horizontal"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as T)}
      className={cn(
        "inline-flex h-control items-stretch gap-0.5 rounded-control border border-border bg-bg-subtle p-0.5 pointer-coarse:h-control-touch",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "inline-flex min-w-16 items-center justify-center gap-1.5 rounded-inner border-2 border-transparent px-3 text-footnote font-medium whitespace-nowrap text-text-secondary outline-none motion-fast hover:bg-border hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=checked]:bg-bg data-[state=checked]:font-semibold data-[state=checked]:hover:bg-bg disabled:text-text-tertiary disabled:hover:bg-transparent disabled:hover:text-text-tertiary",
            CHOSEN[option.tone ?? "brand"],
            fullWidth && "min-w-0 flex-1",
          )}
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export { SegmentedControl };
