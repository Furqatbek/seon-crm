"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
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
        "inline-flex h-control items-stretch gap-0.5 rounded-control bg-bg-subtle p-0.5 pointer-coarse:h-control-touch",
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
            "inline-flex min-w-16 items-center justify-center gap-1.5 rounded-inner border border-transparent px-3 text-footnote font-medium whitespace-nowrap text-text-secondary outline-none motion-fast hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=checked]:border-border data-[state=checked]:bg-bg data-[state=checked]:text-text disabled:text-text-tertiary disabled:hover:text-text-tertiary disabled:data-[state=checked]:bg-transparent disabled:data-[state=checked]:text-text-secondary",
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
