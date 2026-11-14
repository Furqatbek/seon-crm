"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { toCsv, type CsvCell } from "@/lib/csv";

// Chart colours come from the design tokens: purple for the main series,
// dark grey for the comparison, a lighter grey for the rest. No gradients.
export const SERIES = {
  main: "var(--purple)",
  comparison: "var(--text)",
  rest: "var(--text-tertiary)",
} as const;
export const GRID = "var(--border)";
export const HOVER = "var(--bg-subtle)";
/** Axis text: caption size, secondary ink, tabular numbers. */
export const TICK = { fill: "var(--text-secondary)", fontSize: 12, fontVariantNumeric: "tabular-nums" } as const;
/** Labels written next to a mark. */
export const VALUE_LABEL = { fill: "var(--text)", fontSize: 12, fontVariantNumeric: "tabular-nums" } as const;
/** The end of a bar that carries the value is rounded; the baseline end is square. */
export const BAR_END_RIGHT: [number, number, number, number] = [0, 4, 4, 0];
export const BAR_END_TOP: [number, number, number, number] = [4, 4, 0, 0];

export type CsvExport = { filename: string; headers: string[]; rows: CsvCell[][] };

function download({ filename, headers, rows }: CsvExport) {
  // The byte order mark makes Excel read Uzbek and Cyrillic text as UTF-8.
  const blob = new Blob(["﻿", toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A report card: title, Export CSV, and the chart. */
export function ChartCard({
  id,
  title,
  hint,
  csv,
  empty,
  controls,
  className,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  csv: CsvExport;
  /** True when there is nothing to draw for the period. */
  empty: boolean;
  controls?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("reports");
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-chart={id}
      className={`flex min-w-0 flex-col gap-4 rounded-card border border-border bg-bg p-4 ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`${id}-title`} className="text-headline text-text">
            {title}
          </h2>
          {hint ? <p className="text-footnote text-text-secondary">{hint}</p> : null}
        </div>
        <Button
          variant="ghost"
          aria-label={t("exportCsvFor", { chart: title })}
          disabled={empty}
          onClick={() => download(csv)}
        >
          <Download aria-hidden />
          {t("exportCsv")}
        </Button>
      </div>
      {controls}
      {empty ? (
        <p className="py-10 text-center text-body text-text-secondary">{t("empty")}</p>
      ) : (
        children
      )}
    </section>
  );
}

/** Which colour is which series. The label is text; the swatch only repeats it. */
export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-footnote text-text-secondary" data-slot="chart-legend">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

type TooltipEntry = { name?: string | number; value?: unknown; color?: string; dataKey?: unknown };

/** The hover card of every chart: the row's label, then each series with its value. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
  footer,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
  formatValue: (value: number, key: string) => string;
  formatLabel?: (label: string) => string;
  footer?: (label: string) => string | null;
}) {
  if (!active || !payload?.length) return null;
  const name = String(label ?? "");
  const extra = footer?.(name);
  return (
    <div className="rounded-control border border-border bg-bg px-3 py-2 text-footnote shadow-float">
      <p className="mb-1 font-medium text-text">{formatLabel ? formatLabel(name) : name}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="text-text numeric">{formatValue(Number(entry.value), String(entry.dataKey))}</span>
          </li>
        ))}
      </ul>
      {extra ? <p className="mt-1 text-text-secondary">{extra}</p> : null}
    </div>
  );
}

/** A long name on a category axis is cut, never wrapped into the plot. */
export function shorten(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}
