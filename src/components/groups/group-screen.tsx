"use client";

import { Archive, ChevronLeft, Ellipsis, Pencil, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { EnrolSheet } from "@/components/enrolments/enrol-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoneyText } from "@/components/ui/money-text";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import type { UserRole } from "@/lib/auth";
import type { AttendanceLock } from "@/lib/domain/attendance";
import { archiveGroup } from "@/lib/groups/actions";
import type { GroupDetail, LessonSheetData, OpenGroup, TeacherOption } from "@/lib/groups/queries";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { GROUP_TABS, type GroupTab } from "@/lib/validation/groups";

import { GroupFormSheet } from "./group-form-sheet";
import { GROUP_TONE, hhmm, type Weekday } from "./group-meta";
import { LessonSheet } from "./lesson-sheet";

/**
 * The group page frame: header, facts, actions and the tab bar. The active
 * tab's content is rendered on the server and passed in.
 */
export function GroupScreen({
  group,
  role,
  tab,
  today,
  teachers,
  openGroups,
  lesson,
  lessonLock,
  children,
}: {
  group: GroupDetail;
  role: UserRole;
  tab: GroupTab;
  today: string;
  teachers: TeacherOption[];
  openGroups: OpenGroup[];
  lesson: LessonSheetData | null;
  lessonLock: AttendanceLock;
  children: React.ReactNode;
}) {
  const t = useTranslations("groups");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tDays = useTranslations("common.weekdays");
  const router = useRouter();
  const { setParams } = useUrlState();
  const [enrolling, setEnrolling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, startArchive] = useTransition();
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();
  const open = group.status !== "finished";

  function archive() {
    startArchive(async () => {
      const result = await archiveGroup(group.id);
      setConfirmArchive(false);
      if (!result.ok) return void toast(t(`errors.${result.error}`));
      toast(t("archive.done"));
      router.push("/groups?tab=all");
    });
  }

  return (
    <>
      <Link
        href="/groups?tab=all"
        className="mb-2 inline-flex items-center gap-1 rounded-inner text-footnote text-text-secondary outline-none motion-fast hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tNav("groups")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {group.name}
            <StatusPill tone={GROUP_TONE[group.status]}>
              <span data-group-status={group.status}>{t(`status.${group.status}`)}</span>
            </StatusPill>
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!open} onClick={() => setEnrolling(true)}>
              <UserPlus aria-hidden />
              {t("actions.addStudent")}
            </Button>
            <Button onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              {t("actions.edit")}
            </Button>
            {role === "owner" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" aria-label={t("actions.more")}>
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmArchive(true)}>
                    <Archive aria-hidden />
                    {t("actions.archive")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      >
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-body text-text" data-slot="group-facts">
          {(
            [
              [t("fields.subject"), [group.subject, group.level].filter(Boolean).join(" · ")],
              [t("fields.teacher"), group.teacher?.full_name ?? "—"],
              [
                t("fields.daysAndTime"),
                `${group.days.map((day) => tDays(String(day) as Weekday)).join(", ")} · ${hhmm(group.start_time)}`,
              ],
              [t("fields.room"), group.room],
              [
                t("fields.students"),
                group.capacity === null ? String(group.students) : `${group.students} / ${group.capacity}`,
              ],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div key={label} className="flex flex-col">
                <dt className="text-footnote text-text-secondary">{label}</dt>
                <dd className="numeric">{value}</dd>
              </div>
            ) : null,
          )}
          <div className="flex flex-col">
            <dt className="text-footnote text-text-secondary">{t("fields.monthlyFee")}</dt>
            <dd>
              <MoneyText amount={group.monthly_fee} />
            </dd>
          </div>
        </dl>
      </PageHeader>

      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as GroupTab);
            setParams({ tab: value === "students" ? null : value, month: null, lesson: null });
          })
        }
        className="gap-6"
      >
        <TabsList>
          {GROUP_TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`groupTabs.${name}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>

      <LessonSheet lesson={lesson} lock={lessonLock} onClose={() => setParams({ lesson: null })} />
      <EnrolSheet
        target={enrolling ? { kind: "enrol", group: { id: group.id, name: group.name } } : null}
        groups={openGroups}
        today={today}
        onClose={() => setEnrolling(false)}
      />
      <GroupFormSheet
        open={editing}
        group={group}
        teachers={teachers}
        today={today}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
      <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("archive.title", { name: group.name })}</DialogTitle>
            <DialogDescription>{t("archive.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive-fill" disabled={archiving} onClick={archive}>
              {t("actions.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
