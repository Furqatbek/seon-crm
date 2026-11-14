"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-icon shrink-0 items-center justify-center rounded-inner border border-border-strong bg-bg text-bg outline-none motion-fast focus-visible:ring-3 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-subtle data-[state=checked]:border-purple data-[state=checked]:bg-purple disabled:data-[state=checked]:border-border-strong disabled:data-[state=checked]:bg-border-strong",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3.5 stroke-[2.5]" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
