import * as React from "react";

import { cn } from "@/lib/utils";

// Shared by Input, Textarea and the Select trigger: subtle fill, no border,
// white with a 3 px purple ring on focus.
export const fieldClasses =
  "w-full rounded-control bg-bg-subtle px-3 text-body text-text outline-none motion-fast placeholder:text-text-tertiary focus-visible:bg-bg focus-visible:ring-3 focus-visible:ring-focus-ring aria-invalid:bg-bg aria-invalid:ring-3 aria-invalid:ring-danger-ring disabled:cursor-not-allowed disabled:text-text-tertiary";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClasses, "h-control pointer-coarse:h-control-touch", className)}
      {...props}
    />
  );
}

export { Input };
