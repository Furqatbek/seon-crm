"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/format";
import { searchStudents, type StudentOption } from "@/lib/groups/actions";

const SEARCH_DELAY_MS = 300;

/** Find a student by name or phone. Students already in the group are left out. */
export function StudentPicker({
  id,
  value,
  onChange,
  excludeGroupId,
  invalid,
}: {
  id: string;
  value: StudentOption | null;
  onChange: (student: StudentOption | null) => void;
  excludeGroupId?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("groups.enrol");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentOption[] | null>(null);

  useEffect(() => {
    const text = query.trim();
    const timer = setTimeout(
      async () => setResults(text.length < 2 ? null : await searchStudents(text, excludeGroupId)),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [query, excludeGroupId]);

  if (value) {
    return (
      <div className="flex min-h-control items-center justify-between gap-3 rounded-control bg-bg-subtle px-3 py-1.5">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body text-text">{value.full_name}</span>
          <span className="text-footnote text-text-secondary numeric">{formatPhone(value.phone)}</span>
        </span>
        <Button variant="ghost" onClick={() => onChange(null)}>
          {t("change")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-secondary"
          aria-hidden
        />
        <Input
          id={id}
          type="search"
          value={query}
          autoComplete="off"
          placeholder={t("findStudent")}
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-10"
        />
      </div>
      {results ? (
        results.length === 0 ? (
          <p className="px-1 text-footnote text-text-secondary">{t("noStudentsFound")}</p>
        ) : (
          <ul className="flex flex-col rounded-control border border-border p-1" data-slot="student-results">
            {results.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(student);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-inner px-2 py-1.5 text-left outline-none motion-fast hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring"
                >
                  <span className="truncate text-body text-text">{student.full_name}</span>
                  <span className="shrink-0 text-footnote text-text-secondary numeric">
                    {formatPhone(student.phone)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
