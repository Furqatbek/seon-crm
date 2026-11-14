import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** A grey block where content is about to appear. It pulses unless the user asked for less motion. */
function Skeleton({ className }: { className?: string }) {
  return <div data-slot="skeleton" aria-hidden className={cn("rounded-control bg-bg-subtle motion-safe:animate-pulse", className)} />;
}

/** Marks the region as busy; the blocks themselves are decoration. */
function Loading({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" data-slot="loading" className="flex flex-col gap-6">
      {label ? <span className="sr-only">{label}</span> : null}
      {children}
    </div>
  );
}

/** "Loading…" in the page's language, for skeletons shown once the language is known. */
function useLoadingLabel() {
  return useTranslations("common")("loading");
}

function HeaderSkeleton({ title, back = false }: { title?: string; back?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {back ? <Skeleton className="h-4 w-24" /> : null}
      <div className="flex min-h-control flex-wrap items-center justify-between gap-3">
        {/* The page's own title when it is known, so only the data is waited for. */}
        {title ? <h1 className="text-large-title text-text">{title}</h1> : <Skeleton className="h-9 w-56 max-w-full" />}
        <Skeleton className="h-control w-32" />
      </div>
    </div>
  );
}

function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      <Skeleton className="h-10 w-full rounded-b-none" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-row items-center gap-4 border-b border-border px-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="hidden h-4 w-1/5 sm:block" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A list page while it loads: title, filters, then rows; optionally KPI cards and a tab bar. */
function ListSkeleton({ title, kpis = 0, tabs = 0, filters = true }: { title?: string; kpis?: number; tabs?: number; filters?: boolean }) {
  const label = useLoadingLabel();
  return (
    <Loading label={label}>
      <HeaderSkeleton title={title} />
      {kpis > 0 ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: kpis }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-card" />
          ))}
        </div>
      ) : null}
      {tabs > 0 ? (
        <div className="flex gap-6 border-b border-border pb-2">
          {Array.from({ length: tabs }, (_, index) => (
            <Skeleton key={index} className="h-5 w-20" />
          ))}
        </div>
      ) : null}
      {filters ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-control w-full sm:w-64" />
          <Skeleton className="h-control w-full sm:w-40" />
        </div>
      ) : null}
      <RowsSkeleton />
    </Loading>
  );
}

/**
 * A record page while it loads: back link, name, a summary card, tabs, then
 * rows. It is shown before the page knows its language (that comes with the
 * record's address), so it carries no text.
 */
function RecordSkeleton() {
  return (
    <Loading>
      <HeaderSkeleton back />
      <Skeleton className="h-20 w-full rounded-card sm:w-64" />
      <div className="flex gap-6 border-b border-border pb-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-5 w-20" />
        ))}
      </div>
      <RowsSkeleton rows={5} />
    </Loading>
  );
}

/** The reports page while it loads: KPI cards, then chart cards. */
function ChartsSkeleton({ title }: { title?: string }) {
  const label = useLoadingLabel();
  return (
    <Loading label={label}>
      <HeaderSkeleton title={title} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-card lg:col-span-2" />
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    </Loading>
  );
}

export { ChartsSkeleton, ListSkeleton, RecordSkeleton, Skeleton };
