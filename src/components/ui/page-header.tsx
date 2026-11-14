import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Large title on the left, at most one primary button on the right,
 * search and filters in a row below (children).
 */
function PageHeader({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header data-slot="page-header" className={cn("mb-6 flex flex-col gap-4", className)}>
      <div className="flex min-h-control flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-large-title break-words text-text">{title}</h1>
        {/* max-w-full: a row of several actions wraps on a phone instead of widening the page */}
        {action ? <div className="max-w-full">{action}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </header>
  );
}

export { PageHeader };
