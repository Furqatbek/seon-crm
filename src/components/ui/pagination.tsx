"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/pagination";

/** "1–50 of 120" with previous and next. Lists show 50 rows per page. */
function Pagination({
  page,
  total,
  onPageChange,
}: {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("common.pagination");
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div
      data-slot="pagination"
      className="flex items-center justify-between gap-3 text-footnote text-text-secondary"
    >
      <span className="numeric">{t("range", { first, last, total })}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("previous")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("next")}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export { Pagination };
