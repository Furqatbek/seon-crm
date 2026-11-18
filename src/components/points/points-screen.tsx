"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { BoardRow } from "@/lib/points/queries";
import type { GroupOption } from "@/lib/students/queries";
import { POINTS_TABS, type BoardPeriod, type PointsTab } from "@/lib/validation/points";

import { BoardPeriodControl, Leaderboard } from "./leaderboard";

const CENTRE = "centre";

/** Staff: Leaderboard, Rewards and Requests. The open tab is rendered on the server. */
export function PointsScreen({
  tab,
  openRequests,
  children,
}: {
  tab: PointsTab;
  /** Requests waiting to be handed over or rejected. */
  openRequests: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("points");
  const tNav = useTranslations("nav");
  const { setParams } = useUrlState();
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();

  return (
    <>
      <PageHeader title={tNav("points")} />
      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as PointsTab);
            setParams({ tab: value === "leaderboard" ? null : value, group: null, period: null, month: null });
          })
        }
        className="gap-6"
      >
        <TabsList>
          {POINTS_TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`tabs.${name}`)}
              {name === "requests" && openRequests > 0 ? (
                <span className="ml-1.5 rounded-full bg-purple px-1.5 text-caption font-medium text-bg numeric" data-open-requests={openRequests}>
                  {openRequests}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>
    </>
  );
}

/** The leaderboard of the whole centre or of a chosen group, this month, a past month or all-time. */
export function BoardTab({
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
  const { setParams } = useUrlState();
  const groupName = groups.find((option) => option.id === group)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>
      <p className="text-footnote text-text-secondary">{t("subtitle")}</p>
      <Leaderboard rows={rows} staff />
    </div>
  );
}
