"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/lib/domain/time";
import { formatMonth } from "@/lib/format";

/** Previous / next month around a month label. `max` stops it at a month ("YYYY-MM"). */
export function MonthNav({
  month,
  max,
  onChange,
}: {
  month: string;
  max?: string;
  onChange: (month: string) => void;
}) {
  const t = useTranslations("common.month");
  const locale = useLocale();
  return (
    <div className="flex items-center gap-1" data-slot="month-nav">
      <Button variant="ghost" size="icon" aria-label={t("previous")} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-36 text-center text-body font-medium text-text" data-month={month}>
        {formatMonth(month, locale)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("next")}
        disabled={max !== undefined && month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}
