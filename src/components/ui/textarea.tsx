import * as React from "react";

import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, "min-h-20 resize-y py-2", className)}
      {...props}
    />
  );
}

export { Textarea };
