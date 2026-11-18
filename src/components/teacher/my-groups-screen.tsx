import { Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { GROUP_TONE, hhmm, type Weekday } from "@/components/groups/group-meta";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import { roomLabel } from "@/lib/domain/rooms";
import type { MyGroup } from "@/lib/teacher/queries";

/** A teacher's start page: one card per group they teach. */
export function MyGroupsScreen({
  groups,
  taught,
}: {
  groups: MyGroup[];
  /** Held lessons the teacher taught this month. Never pay. */
  taught: number;
}) {
  const t = useTranslations("myGroups");
  const tGroups = useTranslations("groups");
  const tDays = useTranslations("common.weekdays");

  return (
    <>
      <PageHeader title={t("title")} subtitle={<span data-lessons-taught={taught}>{t("taught", { count: taught })}</span>} />
      {groups.length === 0 ? (
        <EmptyState icon={Star}>{t("empty")}</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/my-groups/${group.id}`}
                data-my-group={group.id}
                className="flex h-full flex-col gap-2 rounded-card border border-border bg-bg p-4 outline-none motion-fast hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-headline text-text">{group.name}</span>
                  <StatusPill tone={GROUP_TONE[group.status]}>{tGroups(`status.${group.status}`)}</StatusPill>
                </span>
                <span className="text-body text-text-secondary">
                  {group.days.map((day) => tDays(String(day) as Weekday)).join(", ")} ·{" "}
                  <span className="numeric">{hhmm(group.start_time)}</span>
                  {group.room ? ` · ${roomLabel(group.room)}` : ""}
                </span>
                <span className="mt-auto flex items-center gap-2 text-footnote text-text-secondary">
                  <Users className="size-4" aria-hidden />
                  {t("students", { count: group.students })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
