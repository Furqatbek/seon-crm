"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Plus, Presentation, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
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
import type { UserRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { TeacherRow } from "@/lib/teachers/queries";
import type { TeachersSearch } from "@/lib/validation/teachers";

import { TeacherFormSheet } from "./teacher-form-sheet";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, TeacherRow>();
const SEARCH_DELAY_MS = 300;

export function TeachersScreen({
  search,
  rows,
  total,
  role,
}: {
  search: TeachersSearch;
  rows: TeacherRow[];
  total: number;
  role: UserRole;
}) {
  const t = useTranslations("teachers");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tEmpty = useTranslations("empty");
  const router = useRouter();
  const { setParams } = useUrlState();
  const isOwner = role === "owner";

  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState(search.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ q: value.trim(), page: null }), SEARCH_DELAY_MS);
  }

  const columns = useMemo(() => {
    const base = [
      column.display({
        id: "name",
        header: t("fields.name"),
        cell: ({ row }) => (
          <span className="flex items-center gap-3 whitespace-nowrap">
            <Avatar name={row.original.full_name} />
            <span className="font-medium">{row.original.full_name}</span>
            {row.original.is_active ? null : <StatusPill>{t("inactive")}</StatusPill>}
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
        id: "subjects",
        header: t("fields.subjects"),
        cell: ({ row }) =>
          row.original.subjects.length > 0 ? (
            <span className="whitespace-nowrap">{row.original.subjects.join(", ")}</span>
          ) : (
            "—"
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
        id: "lessons",
        header: t("fields.lessonsThisMonth"),
        cell: ({ row }) => row.original.lessonsThisMonth,
      }),
    ];
    // The pay column exists only for the owner.
    return column.columns(
      isOwner
        ? [
            ...base,
            column.display({
              id: "payType",
              header: t("fields.payType"),
              cell: ({ row }) =>
                row.original.payType ? (
                  <span className="whitespace-nowrap">{t(`payType.${row.original.payType}`)}</span>
                ) : (
                  <span className="text-text-secondary">{t("pay.noRate")}</span>
                ),
            }),
          ]
        : base,
    );
  }, [isOwner, t]);

  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });
  const open = (id: string) => router.push(`/teachers/${id}`);

  return (
    <>
      <PageHeader
        title={tNav("teachers")}
        action={
          isOwner ? (
            <Button variant="primary" onClick={() => setFormOpen(true)}>
              <Plus aria-hidden />
              {t("newTeacher")}
            </Button>
          ) : undefined
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
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Presentation}
          action={
            search.q ? (
              <Button onClick={() => setParams({ q: null, page: null })}>{t("clearSearch")}</Button>
            ) : isOwner ? (
              <Button onClick={() => setFormOpen(true)}>{t("newTeacher")}</Button>
            ) : undefined
          }
        >
          {search.q ? t("noMatches") : tEmpty("teachers")}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id} numeric={header.column.id === "lessons"}>
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
                  data-teacher-row={row.id}
                  onClick={() => open(row.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") open(row.id);
                  }}
                  className="outline-none focus-visible:[&>td]:bg-bg-subtle"
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} numeric={cell.column.id === "lessons"}>
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

      {isOwner ? (
        <TeacherFormSheet
          open={formOpen}
          teacher={null}
          onClose={() => setFormOpen(false)}
          onSaved={(id) => {
            setFormOpen(false);
            open(id);
          }}
        />
      ) : null}
    </>
  );
}
