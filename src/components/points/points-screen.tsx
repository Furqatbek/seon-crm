"use client";

import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { BoardRow } from "@/lib/points/queries";
import type { GroupOption } from "@/lib/students/queries";
import type { BoardPeriod } from "@/lib/validation/points";

import { BoardPeriodControl, Leaderboard } from "./leaderboard";

const CENTRE = "centre";

/** Staff: the leaderboard of the whole centre or of a chosen group, this month, a past month or all-time. */
export function PointsScreen({
  rows,
  groups,
  group,
  period,
  month,
  currentMonth,
}: {
  rows: BoardRow[];
  groups: GroupOption[];
  group: string | undefined;
  period: BoardPeriod;
  month: string;
  currentMonth: string;
}) {
  const t = useTranslations("points.board");
  const tNav = useTranslations("nav");
  const { setParams } = useUrlState();
  const groupName = groups.find((option) => option.id === group)?.name;

  return (
    <>
      <PageHeader title={tNav("points")} subtitle={t("subtitle")}>
        <Select value={group ?? CENTRE} onValueChange={(value) => setParams({ group: value === CENTRE ? null : value })}>
          <SelectTrigger aria-label={t("scope")} className="w-full sm:w-64">
            <SelectValue>{groupName ?? t("centre")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CENTRE}>{t("centre")}</SelectItem>
            {groups.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BoardPeriodControl period={period} month={month} currentMonth={currentMonth} />
      </PageHeader>
      <h2 className="mb-3 text-headline text-text">{t("title")}</h2>
      <Leaderboard rows={rows} staff />
    </>
  );
}
