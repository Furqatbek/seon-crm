import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// 36 px tall, 44 px on touch screens. One primary button per screen.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-body font-medium whitespace-nowrap outline-none select-none motion-fast focus-visible:ring-3 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:border-transparent disabled:bg-bg-subtle disabled:text-text-tertiary",
  {
    variants: {
      variant: {
        primary: "bg-purple text-bg hover:bg-purple-hover active:bg-purple-pressed",
        secondary:
          "border border-border-strong bg-bg text-text hover:bg-bg-subtle active:bg-border",
        ghost: "text-text hover:bg-bg-subtle active:bg-border disabled:bg-transparent",
        // Red text everywhere …
        destructive:
          "text-danger hover:bg-danger-tint active:bg-danger-tint focus-visible:ring-danger-ring disabled:bg-transparent",
        // … red fill only for the confirming button inside its dialog.
        "destructive-fill":
          "bg-danger text-bg hover:opacity-90 active:opacity-80 focus-visible:ring-danger-ring",
      },
      size: {
        default: "h-control px-4 pointer-coarse:h-control-touch",
        icon: "size-control pointer-coarse:size-control-touch",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
