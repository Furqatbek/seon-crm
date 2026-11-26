"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewImport, saveImport, type ImportPreview } from "@/lib/questions/actions";
import type { QuestionErrorKey } from "@/lib/validation/questions";

import { bankLabel } from "./bank-label";

/**
 * Import from Excel or CSV: choose a file, read the report of what is ready
 * and which rows are not and why, then save. Nothing is saved before Save.
 */
export function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("questions");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<QuestionErrorKey | null>(null);

  function close() {
    setFile(null);
    setReport(null);
    setError(null);
    onClose();
  }

  function choose(next: File | null) {
    setFile(next);
    setReport(null);
    setError(null);
    if (!next) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("file", next);
      const result = await previewImport(form);
      if (result.ok) setReport(result.data);
      else setError(result.error);
    });
  }

  function save() {
    if (!file) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("file", file);
      const result = await saveImport(form);
      if (!result.ok) return setError(result.error);
      toast(t("import.saved", { count: result.data.created }));
      close();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("import.title")}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <p className="text-body text-text-secondary">{t("import.hint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/api/questions/template" download>
                <Download aria-hidden />
                {t("import.templateXlsx")}
              </a>
            </Button>
            <Button asChild>
              <a href="/api/questions/template?format=csv" download>
                <Download aria-hidden />
                {t("import.templateCsv")}
              </a>
            </Button>
          </div>
          <Field label={t("import.file")} htmlFor="questions-file">
            <Input id="questions-file" type="file" accept=".xlsx,.csv" className="h-auto py-2" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
          </Field>
          {pending && !report ? <p className="text-footnote text-text-secondary">{t("import.reading")}</p> : null}
          {error ? (
            <p role="alert" className="text-footnote text-danger">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          {report ? (
            <div className="flex flex-col gap-3" data-slot="import-report">
              <p className="text-body text-text" data-ready={report.ready} data-rows={report.rows}>
                {t("import.summary", { rows: report.rows, ready: report.ready, left: report.errors.length })}
              </p>
              {report.banks.length > 0 ? (
                <ul className="flex flex-col gap-1 text-footnote text-text-secondary">
                  {report.banks.map((bank) => (
                    <li key={`${bank.subject}|${bank.level}`}>
                      {bankLabel(bank.subject, bank.level)}: <span className="numeric">{bank.count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {report.errors.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("import.row")}</TableHead>
                      <TableHead>{t("import.problem")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.errors.map((row) => (
                      <TableRow key={row.row} data-row={row.row}>
                        <TableCell className="numeric">{row.row}</TableCell>
                        <TableCell>{row.errors.map((key) => t(`import.rowErrors.${key}`)).join(" ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </div>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={close}>
            {tCommon("cancel")}
          </Button>
          <Button variant="primary" disabled={pending || !report || report.ready === 0} onClick={save}>
            {report && report.ready > 0 ? t("import.save", { count: report.ready }) : tCommon("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
