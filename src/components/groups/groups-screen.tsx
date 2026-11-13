"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { CalendarDays, Check, Plus, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useRouter } from "@/i18n/navigation";
import type { AttendanceLock } from "@/lib/domain/attendance";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type {
  GroupRow,
  LessonSheetData,
  TeacherOption,
  TodayLesson,
} from "@/lib/groups/queries";
import { GROUP_STATUSES, type GroupsSearch } from "@/lib/validation/groups";

import { GroupFormSheet } from "./group-form-sheet";
import { GROUP_TONE, hhmm, type Weekday } from "./group-meta";
import { LessonSheet } from "./lesson-sheet";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, GroupRow>();
const ALL = "all";
const SEARCH_DELAY_MS = 300;
const NUMERIC = new Set(["students", "fee"]);

function Today({ lessons, onOpen }: { lessons: TodayLesson[]; onOpen: (id: string) => void }) {
  const t = useTranslations("groups");
  if (lessons.length === 0) {
    return <EmptyState icon={CalendarDays}>{t("today.empty")}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-border rounded-card border border-border">
      {lessons.map((lesson) => (
        <li
          key={lesson.id}
          data-today-lesson={lesson.id}
          data-lesson-status={lesson.status}
          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
        >
          <span className="w-14 shrink-0 text-headline text-text numeric">{hhmm(lesson.start_time)}</span>
          <span className="flex min-w-40 flex-1 flex-col">
            <span className="truncate text-body font-medium text-text">{lesson.group.name}</span>
            <span className="truncate text-footnote text-text-secondary">
              {[
                lesson.teacher.full_name,
                lesson.group.room,
                t("studentCount", { count: lesson.students }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          {lesson.status === "cancelled" ? (
            <StatusPill tone="danger">{t("lesson.statuses.cancelled")}</StatusPill>
          ) : lesson.status === "held" ? (
            // Saved: the button turns into a green tick, and still opens the marks.
            <Button onClick={() => onOpen(lesson.id)} className="border-success text-success">
              <Check aria-hidden />
              {t("today.marked")}
            </Button>
          ) : (
            <Button onClick={() => onOpen(lesson.id)}>{t("today.markAttendance")}</Button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function GroupsScreen({
  search,
  today,
  todayLessons,
  groups,
  teachers,
  lesson,
  lessonLock,
}: {
  search: GroupsSearch;
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
  todayLessons: TodayLesson[] | null;
  groups: { rows: GroupRow[]; total: number } | null;
  teachers: TeacherOption[];
  lesson: LessonSheetData | null;
  lessonLock: AttendanceLock;
}) {
  const t = useTranslations("groups");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tDays = useTranslations("common.weekdays");
  const tEmpty = useTranslations("empty");
  const router = useRouter();
  const { setParams } = useUrlState();

  const [formOpen, setFormOpen] = useState(false);
  const [shownTab, showTab] = useOptimistic(search.tab);
  const [, startTabChange] = useTransition();
  const [query, setQuery] = useState(search.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ q: value.trim(), page: null }), SEARCH_DELAY_MS);
  }

  const columns = useMemo(
    () =>
      column.columns([
        column.display({
          id: "name",
          header: t("fields.name"),
          cell: ({ row }) => <span className="font-medium whitespace-nowrap">{row.original.name}</span>,
        }),
        column.display({
          id: "subject",
          header: t("fields.subject"),
          cell: ({ row }) => (
            <span className="whitespace-nowrap">
              {[row.original.subject, row.original.level].filter(Boolean).join(" · ")}
            </span>
          ),
        }),
        column.display({
          id: "teacher",
          header: t("fields.teacher"),
          cell: ({ row }) => (
            <span className="whitespace-nowrap">{row.original.teacher?.full_name ?? "—"}</span>
          ),
        }),
        column.display({
          id: "schedule",
          header: t("fields.daysAndTime"),
          cell: ({ row }) => (
            <span className="whitespace-nowrap numeric">
              {row.original.days.map((day) => tDays(String(day) as Weekday)).join(", ")} ·{" "}
              {hhmm(row.original.start_time)}
            </span>
          ),
        }),
        column.display({
          id: "students",
          header: t("fields.students"),
          cell: ({ row }) =>
            row.original.capacity === null
              ? row.original.students
              : `${row.original.students} / ${row.original.capacity}`,
        }),
        column.display({
          id: "fee",
          header: t("fields.monthlyFee"),
          cell: ({ row }) => <MoneyText amount={row.original.monthly_fee} />,
        }),
        column.display({
          id: "status",
          header: t("fields.status"),
          cell: ({ row }) => (
            <StatusPill tone={GROUP_TONE[row.original.status]}>{t(`status.${row.original.status}`)}</StatusPill>
          ),
        }),
      ]),
    [t, tDays],
  );

  const rows = groups?.rows ?? [];
  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });
  const open = (id: string) => router.push(`/groups/${id}`);
  const filtered = Boolean(search.q || search.status);

  return (
    <>
      <PageHeader
        title={tNav("groups")}
        action={
          <Button variant="primary" onClick={() => setFormOpen(true)}>
            <Plus aria-hidden />
            {t("newGroup")}
          </Button>
        }
      />

      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as GroupsSearch["tab"]);
            setParams({ tab: value === "today" ? null : value, page: null, lesson: null });
          })
        }
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="today">{t("tabs.today")}</TabsTrigger>
          <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
        </TabsList>
        <TabsContent value={shownTab}>
          {search.tab === "today" ? (
            <Today lessons={todayLessons ?? []} onOpen={(id) => setParams({ lesson: id }, { push: true })} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={tCommon("search")}
                    className="pl-10"
                  />
                </div>
                <Select
                  value={search.status ?? ALL}
                  onValueChange={(value) => setParams({ status: value === ALL ? null : value, page: null })}
                >
                  <SelectTrigger aria-label={t("fields.status")} className="w-full sm:w-44">
                    <SelectValue>
                      {search.status ? t(`status.${search.status}`) : t("filters.allStatuses")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
                    {GROUP_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  icon={Users}
                  action={
                    filtered ? (
                      <Button onClick={() => setParams({ q: null, status: null, page: null })}>
                        {t("filters.clear")}
                      </Button>
                    ) : (
                      <Button onClick={() => setFormOpen(true)}>{t("newGroup")}</Button>
                    )
                  }
                >
                  {filtered ? t("noMatches") : tEmpty("groups")}
                </EmptyState>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                          {group.headers.map((header) => (
                            <TableHead key={header.id} numeric={NUMERIC.has(header.column.id)}>
                              {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {table.getRowModel().rows.map((row) => (
                        <TableRow
                          key={row.id}
                          tabIndex={0}
                          data-group-row={row.id}
                          onClick={() => open(row.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") open(row.id);
                          }}
                          className="outline-none focus-visible:[&>td]:bg-bg-subtle"
                        >
                          {row.getAllCells().map((cell) => (
                            <TableCell key={cell.id} numeric={NUMERIC.has(cell.column.id)}>
                              <table.FlexRender cell={cell} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    page={search.page}
                    total={groups?.total ?? 0}
                    onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
                  />
                </>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <LessonSheet lesson={lesson} lock={lessonLock} onClose={() => setParams({ lesson: null })} />
      <GroupFormSheet
        open={formOpen}
        group={null}
        teachers={teachers}
        today={today}
        onClose={() => setFormOpen(false)}
        onSaved={(id) => {
          setFormOpen(false);
          open(id);
        }}
      />
    </>
  );
}
