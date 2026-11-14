import * as React from "react";

import { cn } from "@/lib/utils";

// No vertical lines, hairline row dividers, 48 px rows, sticky header,
// money right-aligned with tabular numbers (numeric).

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // Focusable, so a wide table can be scrolled sideways with the arrow keys.
    <div
      data-slot="table-container"
      tabIndex={0}
      className="relative w-full overflow-auto rounded-inner outline-none focus-visible:ring-3 focus-visible:ring-focus-ring"
    >
      <table
        data-slot="table"
        className={cn("w-full border-separate border-spacing-0 text-body", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&>tr:last-child>td]:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({
  className,
  selected,
  ...props
}: React.ComponentProps<"tr"> & { selected?: boolean }) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected ? "true" : undefined}
      className={cn(
        "motion-fast data-selected:[&>td]:bg-purple-tint [tbody>&:hover>td]:bg-bg-subtle [tbody>&[data-selected=true]:hover>td]:bg-purple-tint",
        props.onClick && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "sticky top-0 z-10 h-10 bg-bg-subtle px-4 text-left text-footnote font-normal whitespace-nowrap text-text-secondary first:rounded-l-control last:rounded-r-control",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-row border-b border-border px-4 motion-fast",
        numeric && "text-right whitespace-nowrap numeric",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
