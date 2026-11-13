"use client";

import { Archive, ChevronLeft, Ellipsis, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import type { UserRole } from "@/lib/auth";
import { formatDay, formatPhone } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { archiveTeacher } from "@/lib/teachers/actions";
import type { TeacherDetail } from "@/lib/teachers/queries";

import { PayTab } from "./pay-tab";
import { TeacherFormSheet } from "./teacher-form-sheet";
import { LESSON_TONE } from "./teacher-meta";

type Weekday = "1" | "2" | "3" | "4" | "5" | "6" | "7";
const time = (value: string) => value.slice(0, 5);

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2">
      <dt className="text-footnote text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-body break-words text-text">{children}</dd>
    </div>
  );
}

function Overview({ teacher }: { teacher: TeacherDetail }) {
  const t = useTranslations("teachers");
  const tDays = useTranslations("common.weekdays");
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="contacts-title" className="flex flex-col gap-2">
          <h2 id="contacts-title" className="text-headline text-text">
            {t("contacts")}
          </h2>
          <dl className="divide-y divide-border border-y border-border">
            <Detail label={t("fields.phone")}>
              <a
                href={`tel:${teacher.phone}`}
                className="rounded-inner text-purple outline-none numeric hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                {formatPhone(teacher.phone)}
              </a>
            </Detail>
            <Detail label={t("fields.subjects")}>
              {teacher.subjects.length > 0 ? teacher.subjects.join(", ") : "—"}
            </Detail>
            {teacher.hired_on ? (
              <Detail label={t("fields.hiredOn")}>
                {formatDay(teacher.hired_on, locale, { year: true, month: "long" })}
              </Detail>
            ) : null}
            {teacher.notes ? (
              <Detail label={t("fields.notes")}>
                <span className="whitespace-pre-wrap">{teacher.notes}</span>
              </Detail>
            ) : null}
          </dl>
        </section>

        <section aria-labelledby="groups-title" className="flex flex-col gap-2">
          <h2 id="groups-title" className="flex items-center gap-2 text-headline text-text">
            {t("fields.groups")}
            <Badge>{teacher.groups.length}</Badge>
          </h2>
          {teacher.groups.length === 0 ? (
            <p className="border-y border-border py-4 text-body text-text-secondary">{t("noGroups")}</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {teacher.groups.map((group) => (
                <li key={group.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-text">{group.name}</span>
                    <span className="truncate text-footnote text-text-secondary">{group.subject}</span>
                  </span>
                  <span className="shrink-0 text-footnote whitespace-nowrap text-text-secondary numeric">
                    {group.days
                      .map((day) => tDays(String(day) as Weekday))
                      .join(", ")}
                    {" · "}
                    {time(group.start_time)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="lessons-title" className="flex flex-col gap-3">
        <h2 id="lessons-title" className="flex items-center gap-2 text-headline text-text">
          {t("lessonsThisMonth")}
          <Badge>{teacher.lessons.filter((lesson) => lesson.status !== "cancelled").length}</Badge>
        </h2>
        {teacher.lessons.length === 0 ? (
          <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
            {t("noLessons")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lesson.date")}</TableHead>
                <TableHead>{t("lesson.time")}</TableHead>
                <TableHead>{t("lesson.group")}</TableHead>
                <TableHead>{t("lesson.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teacher.lessons.map((lesson) => (
                <TableRow key={lesson.id}>
                  <TableCell className="whitespace-nowrap numeric">
                    {formatDay(lesson.lesson_date, locale)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap numeric">{time(lesson.start_time)}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {lesson.group?.name ?? "—"}
                      {/* This teacher stood in for the group's own teacher. */}
                      {lesson.group && lesson.group.teacher_id !== teacher.id ? (
                        <Badge tone="purple">{t("lesson.substitute")}</Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={LESSON_TONE[lesson.status]}>
                      {t(`lesson.statuses.${lesson.status}`)}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/** Contacts, groups and this month's lessons; the owner also gets the Pay tab. */
export function TeacherScreen({
  teacher,
  role,
  tab,
  nowIso,
}: {
  teacher: TeacherDetail;
  role: UserRole;
  tab: "overview" | "pay";
  nowIso: string;
}) {
  const t = useTranslations("teachers");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { setParams } = useUrlState();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, startArchive] = useTransition();
  const isOwner = role === "owner" && teacher.pay !== null;

  function archive() {
    startArchive(async () => {
      const result = await archiveTeacher(teacher.id);
      setConfirmArchive(false);
      if (!result.ok) return void toast(t(`errors.${result.error}`));
      toast(t("archive.done"));
      router.push("/teachers");
    });
  }

  return (
    <>
      <Link
        href="/teachers"
        className="mb-2 inline-flex items-center gap-1 rounded-inner text-footnote text-text-secondary outline-none motion-fast hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tNav("teachers")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {teacher.full_name}
            {teacher.is_active ? null : <StatusPill>{t("inactive")}</StatusPill>}
          </span>
        }
        action={
          isOwner ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                {t("actions.edit")}
              </Button>
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
            </div>
          ) : undefined
        }
      />

      {isOwner && teacher.pay ? (
        <Tabs
          value={tab}
          onValueChange={(value) => setParams({ tab: value === "overview" ? null : value })}
          className="gap-6"
        >
          <TabsList>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="pay">{t("tabs.pay")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Overview teacher={teacher} />
          </TabsContent>
          <TabsContent value="pay">
            <PayTab
              teacherId={teacher.id}
              rates={teacher.pay.rates}
              payouts={teacher.pay.payouts}
              now={now}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <Overview teacher={teacher} />
      )}

      {isOwner ? (
        <>
          <TeacherFormSheet
            open={editing}
            teacher={teacher}
            onClose={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
          <Dialog open={confirmArchive} onOpenChange={setConfirmArchive}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("archive.title", { name: teacher.full_name })}</DialogTitle>
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
      ) : null}
    </>
  );
}
