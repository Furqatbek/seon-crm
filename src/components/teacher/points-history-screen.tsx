"use client";

import { History } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PointsText } from "@/components/points/points-text";
import { presetLabel } from "@/components/points/preset-label";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDateTime } from "@/lib/format";
import type { HistoryRow, PointPreset } from "@/lib/points/queries";

/** Every point this teacher gave or took this month, newest first. Names only. */
export function PointsHistoryScreen({ rows, presets }: { rows: HistoryRow[]; presets: PointPreset[] }) {
  const t = useTranslations("points");
  const locale = useLocale();
  const labels = new Map(presets.map((preset) => [preset.id, presetLabel(preset, locale)]));

  return (
    <>
      <PageHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      {rows.length === 0 ? (
        <EmptyState icon={History}>{t("history.empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((row) => (
            <li key={row.id} data-history-row={row.delta} className="flex min-h-row items-center gap-3 px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{row.studentName}</span>
                  {row.isUndo ? <StatusPill>{t("history.undone")}</StatusPill> : null}
                </span>
                <span className="text-footnote text-text-secondary">
                  {(row.presetId && labels.get(row.presetId)) || row.reason || "—"}
                  {row.groupName ? ` · ${row.groupName}` : ""}
                </span>
                <span className="text-footnote text-text-secondary numeric">
                  {formatDateTime(row.at, locale)}
                </span>
              </span>
              <PointsText value={row.delta} signed className="font-medium" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
