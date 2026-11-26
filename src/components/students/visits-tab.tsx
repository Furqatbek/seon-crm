import { LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { StatusPill } from "@/components/ui/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { StudentVisit } from "@/lib/students/queries";

/** When the student came to the centre and left it. Lesson attendance is its own tab. */
export function VisitsTab({ visits }: { visits: StudentVisit[] }) {
  const t = useTranslations("students.visits");
  const locale = useLocale();

  if (visits.length === 0) {
    return <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">{t("empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("date")}</TableHead>
          <TableHead>{t("kind")}</TableHead>
          <TableHead>{t("method")}</TableHead>
          <TableHead>{t("by")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visits.map((visit) => (
          <TableRow key={visit.id} data-visit={visit.kind}>
            <TableCell className="whitespace-nowrap numeric">{formatDateTime(visit.at, locale)}</TableCell>
            <TableCell>
              <StatusPill tone={visit.kind === "arrived" ? "success" : "neutral"}>
                {visit.kind === "arrived" ? <LogIn aria-hidden className="size-3.5" /> : <LogOut aria-hidden className="size-3.5" />}
                {t(`kinds.${visit.kind}`)}
              </StatusPill>
            </TableCell>
            <TableCell className="whitespace-nowrap">{t(`methods.${visit.method}`)}</TableCell>
            <TableCell>{visit.scannedBy ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
