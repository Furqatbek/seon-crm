"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useRouter } from "@/i18n/navigation";
import { formatMonth } from "@/lib/format";
import type { TvBoard, TvRow } from "@/lib/points/queries";
import { cn } from "@/lib/utils";

/** Each board stays on screen this long. */
export const SLIDE_SECONDS = 15;
/** The data is read again this often. */
export const REFRESH_SECONDS = 60;

function Rows({ rows, large }: { rows: TvRow[]; large: boolean }) {
  const t = useTranslations("tv");
  if (rows.length === 0) {
    return <p className="mt-24 text-center text-[40px] text-text-secondary">{t("empty")}</p>;
  }
  return (
    <ol className={cn("mx-auto flex w-full max-w-[1400px] flex-col", large ? "gap-5" : "gap-2")}>
      {rows.map((row, index) => {
        const first = row.rank === 1;
        return (
          <li
            // Tied names can repeat: the position keeps the key unique.
            key={`${index}:${row.name}`}
            data-tv-row={row.name}
            data-rank={row.rank}
            className={cn(
              "flex items-center gap-8 rounded-card px-10",
              large ? "h-[120px]" : "h-[68px]",
              first ? "bg-brand-tint" : "bg-bg-subtle",
            )}
          >
            <span
              className={cn(
                "w-20 shrink-0 text-center font-semibold numeric",
                large ? "text-[56px]" : "text-[40px]",
                first ? "text-brand-ink" : "text-text-secondary",
              )}
            >
              {row.rank}
            </span>
            <span className={cn("min-w-0 flex-1 truncate font-medium text-text", large ? "text-[56px]" : "text-[40px]")}>
              {row.name}
            </span>
            <span className={cn("shrink-0 font-semibold numeric", large ? "text-[56px]" : "text-[40px]", first ? "text-brand-ink" : "text-text")}>
              {row.points}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Full screen at 1920 × 1080, always light: the centre's top 10 this month,
 * then each group's top 5, one board at a time. The brand orange marks only first place.
 */
export function TvScreen({ board, updatedAt }: { board: TvBoard; updatedAt: string }) {
  const t = useTranslations("tv");
  const locale = useLocale();
  const router = useRouter();
  const slides = [{ title: t("centreTitle"), rows: board.centre, large: false }].concat(
    board.groups.map((group) => ({ title: group.name, rows: group.rows, large: true })),
  );
  const [index, setIndex] = useState(0);
  const slide = slides[index % slides.length];

  useEffect(() => {
    const rotate = setInterval(() => setIndex((current) => current + 1), SLIDE_SECONDS * 1000);
    const reload = setInterval(() => router.refresh(), REFRESH_SECONDS * 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(reload);
    };
  }, [router]);

  return (
    <main
      data-slot="tv"
      data-slide={index % slides.length}
      data-slides={slides.length}
      className="flex h-dvh w-screen flex-col overflow-hidden bg-bg px-24 pt-14 pb-10 leading-[1.3] text-text [color-scheme:light] [&_*]:leading-[1.3]"
    >
      <header className="mb-10 flex items-baseline justify-between gap-8">
        <h1 className="truncate text-[72px] leading-tight font-semibold text-text" data-tv-title>
          {slide.title}
        </h1>
        <p className="shrink-0 text-[36px] text-text-secondary">
          {slide.large ? t("groupSubtitle", { month: formatMonth(board.month, locale) }) : formatMonth(board.month, locale)}
        </p>
      </header>

      <div className="min-h-0 flex-1">
        <Rows rows={slide.rows} large={slide.large} />
      </div>

      <footer className="mt-8 flex items-center justify-between text-[32px] text-text-secondary">
        <span className="truncate">{board.centre_name}</span>
        <span className="shrink-0 numeric" data-tv-updated>
          {t("updated", { time: updatedAt })}
        </span>
      </footer>
    </main>
  );
}
