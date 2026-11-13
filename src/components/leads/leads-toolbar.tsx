"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_SOURCES } from "@/lib/domain/leads";
import type { StaffOption } from "@/lib/leads/queries";
import type { LeadsSearch } from "@/lib/validation/leads";

import { useLeadsUrl } from "./use-leads-url";

const ALL = "all";
const SEARCH_DELAY_MS = 300;

export function LeadsToolbar({ search, staff }: { search: LeadsSearch; staff: StaffOption[] }) {
  const t = useTranslations("leads");
  const tCommon = useTranslations("common");
  const { setParams } = useLeadsUrl();
  const [query, setQuery] = useState(search.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    // Search waits 300 ms after typing.
    timer.current = setTimeout(() => setParams({ q: value.trim(), page: null }), SEARCH_DELAY_MS);
  }

  return (
    <>
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
        value={search.source ?? ALL}
        onValueChange={(value) => setParams({ source: value === ALL ? null : value, page: null })}
      >
        <SelectTrigger aria-label={t("fields.source")} className="w-[calc(50%-0.25rem)] sm:w-44">
          <SelectValue>
            {search.source ? t(`source.${search.source}`) : t("filters.allSources")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allSources")}</SelectItem>
          {LEAD_SOURCES.map((source) => (
            <SelectItem key={source} value={source}>
              {t(`source.${source}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={search.assigned ?? ALL}
        onValueChange={(value) => setParams({ assigned: value === ALL ? null : value, page: null })}
      >
        <SelectTrigger aria-label={t("fields.assignedTo")} className="w-[calc(50%-0.25rem)] sm:w-48">
          <SelectValue>
            {staff.find((person) => person.id === search.assigned)?.full_name ?? t("filters.allStaff")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("filters.allStaff")}</SelectItem>
          {staff.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SegmentedControl
        aria-label={t("view.label")}
        className="sm:ml-auto"
        value={search.view}
        onValueChange={(view) => setParams({ view: view === "board" ? null : view, page: null })}
        options={[
          { value: "board", label: t("view.board") },
          { value: "list", label: t("view.list") },
        ]}
      />
    </>
  );
}
