import { useLocale, useTranslations } from "next-intl";

import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { StudentMessage } from "@/lib/students/queries";

import { MESSAGE_TONE } from "./student-meta";

/** Everything sent to this student, and what happened to it. */
export function MessagesTab({ messages }: { messages: StudentMessage[] }) {
  const t = useTranslations("students.messages");
  const locale = useLocale();

  if (messages.length === 0) {
    return (
      <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">
        {t("empty")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("date")}</TableHead>
          <TableHead>{t("type")}</TableHead>
          <TableHead>{t("channel")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead>{t("text")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.map((message) => (
          <TableRow key={message.id}>
            <TableCell className="whitespace-nowrap numeric">
              {formatDateTime(message.sent_at ?? message.created_at, locale)}
            </TableCell>
            <TableCell className="whitespace-nowrap">{t(`types.${message.type}`)}</TableCell>
            <TableCell className="whitespace-nowrap">{t(`channels.${message.channel}`)}</TableCell>
            <TableCell>
              <StatusPill tone={MESSAGE_TONE[message.status]}>{t(`statuses.${message.status}`)}</StatusPill>
            </TableCell>
            <TableCell>
              <span className="flex min-w-64 flex-col py-1">
                <span className="break-words">{message.body}</span>
                {message.error ? <span className="text-footnote text-danger">{message.error}</span> : null}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
