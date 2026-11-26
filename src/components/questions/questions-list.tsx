"use client";

import { Archive, Eye, FileUp, HelpCircle, Pencil, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLAG_MIN_USES } from "@/lib/domain/questions";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { archiveQuestion, setQuestionActive } from "@/lib/questions/actions";
import type { BankOption, QuestionRow } from "@/lib/questions/queries";
import { QUESTION_FLAGS, QUESTION_STATES, bankKey, type QuestionsSearch } from "@/lib/validation/questions";

import { bankLabel } from "./bank-label";
import { ImportSheet } from "./import-sheet";
import { QuestionFormSheet } from "./question-form-sheet";
import { QuestionPreview } from "./question-preview";

const ALL = "all";

/**
 * The question bank. Staff see every question, switch it on or off and import
 * a file; a teacher sees their own subjects, writes and edits.
 */
export function QuestionsList({
  rows,
  total,
  flagged,
  banks,
  search,
  role,
  minQuestions,
}: {
  rows: QuestionRow[];
  total: number;
  /** Questions with a flag, whatever the filter. */
  flagged: number;
  banks: BankOption[];
  search: QuestionsSearch;
  role: "owner" | "manager" | "teacher";
  /** Active questions a bank needs before random matches open. */
  minQuestions: number;
}) {
  const t = useTranslations("questions");
  const tCommon = useTranslations("common");
  const { setParams } = useUrlState();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(search.q);
  const [preview, setPreview] = useState<QuestionRow | null>(null);
  const [form, setForm] = useState<"new" | QuestionRow | null>(null);
  const [importing, setImporting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A search still waiting to be sent does not follow the person to another page.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const staff = role !== "teacher";
  const chosen = banks.find((bank) => bankKey(bank.subject, bank.level) === search.bank);

  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setParams({ q: value.trim() || null, page: null }), 300);
  }

  function toggle(row: QuestionRow, active: boolean) {
    startTransition(async () => {
      const result = await setQuestionActive({ id: row.id, active });
      if (!result.ok) toast(t(`errors.${result.error}`));
    });
  }

  function archive(row: QuestionRow) {
    startTransition(async () => {
      const result = await archiveQuestion(row.id);
      toast(result.ok ? t("archived") : t(`errors.${result.error}`));
    });
  }

  return (
    <div className="flex flex-col gap-4" data-slot="questions">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("searchPlaceholder")} aria-label={tCommon("search")} className="pl-9" />
        </div>
        <Select value={search.bank || ALL} onValueChange={(value) => setParams({ bank: value === ALL ? null : value, page: null })}>
          <SelectTrigger aria-label={t("bank")} className="w-auto min-w-40">
            <SelectValue>{chosen ? bankLabel(chosen.subject, chosen.level) : t("allBanks")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allBanks")}</SelectItem>
            {banks.map((bank) => (
              <SelectItem key={bankKey(bank.subject, bank.level)} value={bankKey(bank.subject, bank.level)}>
                {bankLabel(bank.subject, bank.level)} ({bank.activeQuestions})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.state} onValueChange={(value) => setParams({ state: value === "all" ? null : value, page: null })}>
          <SelectTrigger aria-label={t("state.label")} className="w-auto min-w-32">
            <SelectValue>{t(`state.${search.state}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {QUESTION_STATES.map((state) => (
              <SelectItem key={state} value={state}>
                {t(`state.${state}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={search.flag} onValueChange={(value) => setParams({ flag: value === "any" ? null : value, page: null })}>
          <SelectTrigger aria-label={t("flag.label")} className="w-auto min-w-36">
            <SelectValue>{t(`flag.${search.flag}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {QUESTION_FLAGS.map((flag) => (
              <SelectItem key={flag} value={flag}>
                {t(`flag.${flag}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {staff ? (
          <Button variant="primary" onClick={() => setImporting(true)}>
            <FileUp aria-hidden />
            {t("import.open")}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setForm("new")} disabled={banks.length === 0}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
        )}
      </div>

      {/* How far each bank is from opening random matches. */}
      {chosen ? (
        <p className="text-footnote text-text-secondary" data-slot="bank-status">
          {chosen.activeQuestions >= minQuestions
            ? t("bankOpen", { count: chosen.activeQuestions })
            : t("bankClosed", { count: chosen.activeQuestions, min: minQuestions })}
        </p>
      ) : null}
      {flagged > 0 && search.flag === "any" ? (
        <p className="rounded-control bg-warning-tint px-3 py-2 text-footnote text-warning" data-slot="flagged-note">
          {t("flaggedNote", { count: flagged })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={HelpCircle}>{search.q || search.bank || search.state !== "all" || search.flag !== "any" ? t("noMatches") : t(staff ? "emptyStaff" : "emptyTeacher")}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.question")}</TableHead>
                <TableHead>{t("columns.bank")}</TableHead>
                <TableHead className="text-right">{t("columns.right")}</TableHead>
                <TableHead>{t("columns.on")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("columns.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} data-question={row.id} data-flag={row.flag ?? undefined}>
                  <TableCell>
                    <span className="flex min-w-56 max-w-xl flex-col gap-0.5 py-1">
                      <span className="break-words text-body text-text">{row.text}</span>
                      <span className="text-footnote text-text-secondary">
                        {t(`languages.${row.language as "uz" | "ru" | "en" | "ko"}`)} · {t("difficulty", { level: row.difficulty })}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{bankLabel(row.subject, row.level)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <span className="flex flex-col items-end gap-1">
                      <span className="numeric" data-cell="rate">
                        {row.times_used > 0 ? t("rate", { percent: Math.round((row.times_correct / row.times_used) * 100), used: row.times_used }) : t("notUsed")}
                      </span>
                      {row.flag ? <StatusPill tone={row.flag === "tooHard" ? "danger" : "warning"}>{t(`flag.${row.flag}`)}</StatusPill> : null}
                      {!row.flag && row.times_used > 0 && row.times_used < FLAG_MIN_USES ? <span className="text-footnote text-text-tertiary">{t("fewAnswers")}</span> : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    {staff ? (
                      <Switch checked={row.is_active} disabled={pending} onCheckedChange={(active) => toggle(row, active)} aria-label={`${t("columns.on")}: ${row.text}`} />
                    ) : (
                      <StatusPill tone={row.is_active ? "success" : "neutral"}>{t(row.is_active ? "state.on" : "state.off")}</StatusPill>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => setPreview(row)} aria-label={`${t("preview.open")}: ${row.text}`}>
                        <Eye aria-hidden />
                      </Button>
                      {staff ? null : (
                        <Button variant="ghost" onClick={() => setForm(row)} aria-label={`${t("edit")}: ${row.text}`}>
                          <Pencil aria-hidden />
                        </Button>
                      )}
                      {role === "owner" ? (
                        <Button variant="ghost" disabled={pending} onClick={() => archive(row)} aria-label={`${t("archive")}: ${row.text}`}>
                          <Archive aria-hidden />
                        </Button>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={search.page} total={total} onPageChange={(next) => setParams({ page: next <= 1 ? null : String(next) })} />
        </div>
      )}

      <QuestionPreview question={preview} onClose={() => setPreview(null)} />
      {staff ? <ImportSheet open={importing} onClose={() => setImporting(false)} /> : null}
      {staff ? null : <QuestionFormSheet target={form} banks={banks} onClose={() => setForm(null)} />}
    </div>
  );
}
