"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatPhone } from "@/lib/format";
import type { LeadSummary, StaffOption } from "@/lib/leads/queries";
import { LEADS_PAGE_SIZE } from "@/lib/validation/leads";

import { SOURCE_ICON, STATUS_TONE } from "./lead-meta";
import { NextContact } from "./next-contact";
import { useLeadsUrl } from "./use-leads-url";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, LeadSummary>();

export function LeadList({
  rows,
  total,
  page,
  staff,
  now,
  onOpen,
}: {
  rows: LeadSummary[];
  total: number;
  page: number;
  staff: StaffOption[];
  now: Date;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("leads");
  const locale = useLocale();
  const { setParams } = useLeadsUrl();

  const columns = useMemo(() => {
    const names = new Map(staff.map((person) => [person.id, person.full_name]));
    return column.columns([
      column.display({
        id: "name",
        header: t("fields.name"),
        cell: ({ row }) => (
          <span className="font-medium whitespace-nowrap">{row.original.full_name}</span>
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
        id: "subject",
        header: t("fields.subject"),
        cell: ({ row }) => row.original.subject_interest ?? "—",
      }),
      column.display({
        id: "source",
        header: t("fields.source"),
        cell: ({ row }) => {
          const Icon = SOURCE_ICON[row.original.source];
          return (
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Icon className="size-4 text-text-secondary" aria-hidden />
              {t(`source.${row.original.source}`)}
            </span>
          );
        },
      }),
      column.display({
        id: "status",
        header: t("fields.status"),
        cell: ({ row }) => (
          <StatusPill tone={STATUS_TONE[row.original.status]}>
            {t(`status.${row.original.status}`)}
          </StatusPill>
        ),
      }),
      column.display({
        id: "nextContact",
        header: t("fields.nextContact"),
        cell: ({ row }) =>
          row.original.next_contact_at ? <NextContact lead={row.original} now={now} /> : "—",
      }),
      column.display({
        id: "assignedTo",
        header: t("fields.assignedTo"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {(row.original.assigned_to && names.get(row.original.assigned_to)) ?? "—"}
          </span>
        ),
      }),
      column.display({
        id: "created",
        header: t("fields.created"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-text-secondary numeric">
            {formatDate(row.original.created_at, locale, { year: true })}
          </span>
        ),
      }),
    ]);
  }, [locale, now, staff, t]);

  const table = useTable({ features, columns, data: rows, getRowId: (row) => row.id });

  const first = total === 0 ? 0 : (page - 1) * LEADS_PAGE_SIZE + 1;
  const last = Math.min(page * LEADS_PAGE_SIZE, total);
  const pages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
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
              data-lead-row={row.id}
              onClick={() => onOpen(row.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onOpen(row.id);
              }}
              className="outline-none focus-visible:[&>td]:bg-bg-subtle"
            >
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 text-footnote text-text-secondary">
        <span className="numeric">{t("pagination.range", { first, last, total })}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("pagination.previous")}
            disabled={page <= 1}
            onClick={() => setParams({ page: page - 1 <= 1 ? null : String(page - 1) })}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("pagination.next")}
            disabled={page >= pages}
            onClick={() => setParams({ page: String(page + 1) })}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
