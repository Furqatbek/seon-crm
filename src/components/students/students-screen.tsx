"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { GraduationCap, Plus, Search, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useRouter } from "@/i18n/navigation";
import { balanceState } from "@/lib/domain/ledger";
import { formatPhone } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { GroupOption, StudentRow } from "@/lib/students/queries";
import { STUDENT_STATUSES, type StudentsSearch } from "@/lib/validation/students";

import { BalanceText } from "./balance-text";
import { StudentFormSheet, type StudentFormMode } from "./student-form-sheet";
import { STUDENT_TONE } from "./student-meta";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, StudentRow>();
const ALL = "all";
const SEARCH_DELAY_MS = 300;
const NUMERIC = new Set(["balance"]);

export function StudentsScreen({
  search,
  rows,
  total,
  groups,
  today,
  dueDay,
}: {
  search: StudentsSearch;
  rows: StudentRow[];
  total: number;
  groups: GroupOption[];
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
  dueDay: number;
}) {
  const t = useTranslations("students");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tEmpty = useTranslations("empty");
  const router = useRouter();
  const { setParams } = useUrlState();

  const [form, setForm] = useState<StudentFormMode | null>(null);
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
          cell: ({ row }) => (
            <span className="flex items-center gap-3 whitespace-nowrap">
              <Avatar name={row.original.full_name} />
              <span className="font-medium">{row.original.full_name}</span>
            </span>
          ),
        }),
        column.display({
          id: "phone",
          header: t("fields.phone"),
          cell: ({ row }) => (
            <span className="whitespace-nowrap numeric">{formatPhone(row.original.phone)}</span>
          ),
        }),
        column.display({
          id: "groups",
          header: t("fields.groups"),
          cell: ({ row }) =>
            row.original.groups.length > 0 ? (
              <span className="flex gap-1">
                {row.original.groups.map((group) => (
                  <Badge key={group.id}>{group.name}</Badge>
                ))}
              </span>
            ) : (
              "—"
            ),
        }),
        column.display({
          id: "balance",
          header: t("fields.balance"),
          cell: ({ row }) => (
            <BalanceText
              balance={row.original.balance}
              state={balanceState(row.original.balance, {
                today,
                dueDay,
                oldestUnpaidMonth: row.original.oldestUnpaidMonth,
              })}
            />
          ),
        }),
        column.display({
          id: "status",
          header: t("fields.status"),
          cell: ({ row }) => (
            <StatusPill tone={STUDENT_TONE[row.original.status]}>
              {t(`status.${row.original.status}`)}
            </StatusPill>
          ),
        }),
        column.display({
          id: "telegram",
          header: t("fields.telegram"),
          cell: ({ row }) =>
            row.original.telegramLinked ? (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-text-secondary">
                <Send className="size-4 text-purple" aria-hidden />
                <span className="text-footnote">{t("telegram.linkedShort")}</span>
              </span>
            ) : (
              <span className="text-text-secondary" aria-label={t("telegram.notLinked")}>
                —
              </span>
            ),
        }),
      ]),
    [dueDay, t, today],
  );

  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });
  const open = (id: string) => router.push(`/students/${id}`);
  const filtered = Boolean(search.q || search.status || search.group || search.debt);

  return (
    <>
      <PageHeader
        title={tNav("students")}
        action={
          <Button variant="primary" onClick={() => setForm({ kind: "new" })}>
            <Plus aria-hidden />
            {t("newStudent")}
          </Button>
        }
      >
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
          <SelectTrigger aria-label={t("fields.status")} className="w-[calc(50%-0.25rem)] sm:w-40">
            <SelectValue>
              {search.status ? t(`status.${search.status}`) : t("filters.allStatuses")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
            {STUDENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.group ?? ALL}
          onValueChange={(value) => setParams({ group: value === ALL ? null : value, page: null })}
        >
          <SelectTrigger aria-label={t("fields.group")} className="w-[calc(50%-0.25rem)] sm:w-52">
            <SelectValue>
              {groups.find((group) => group.id === search.group)?.name ?? t("filters.allGroups")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.allGroups")}</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex h-control items-center gap-2 pointer-coarse:h-control-touch">
          <Checkbox
            id="students-debt-only"
            checked={search.debt === "1"}
            onCheckedChange={(checked) => setParams({ debt: checked === true ? "1" : null, page: null })}
          />
          <Label htmlFor="students-debt-only" className="text-body text-text">
            {t("filters.debtOnly")}
          </Label>
        </span>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          action={
            filtered ? (
              <Button
                onClick={() => setParams({ q: null, status: null, group: null, debt: null, page: null })}
              >
                {t("filters.clear")}
              </Button>
            ) : (
              <Button onClick={() => setForm({ kind: "new" })}>{t("newStudent")}</Button>
            )
          }
        >
          {filtered ? t("noMatches") : tEmpty("students")}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
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
                  data-student-row={row.id}
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
            total={total}
            onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })}
          />
        </div>
      )}

      <StudentFormSheet
        mode={form}
        onClose={() => setForm(null)}
        onSaved={(id, enrol) => {
          setForm(null);
          router.push(enrol ? `/students/${id}?enrol=1` : `/students/${id}`);
        }}
      />
    </>
  );
}
