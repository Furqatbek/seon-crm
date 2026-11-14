"use client";

import { Check, Copy, QrCode as QrIcon, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { EnrolSheet, type EnrolTarget } from "@/components/enrolments/enrol-sheet";
import { LeaveSheet, type LeaveTarget } from "@/components/enrolments/leave-sheet";
import { EnrolmentMenu } from "@/components/groups/enrolment-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/ui/money-text";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import { formatDay, formatPhone } from "@/lib/format";
import type { OpenGroup } from "@/lib/groups/queries";
import type { StudentDetail } from "@/lib/students/queries";

import { QrCode } from "./qr-code";

type Weekday = "1" | "2" | "3" | "4" | "5" | "6" | "7";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-2">
      <dt className="text-footnote text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-body break-words text-text">{children}</dd>
    </div>
  );
}

const phoneLink =
  "rounded-inner text-purple outline-none numeric hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring";

function TelegramCard({ student, botUsername }: { student: StudentDetail; botUsername: string | null }) {
  const t = useTranslations("students.telegram");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const link = botUsername
    ? `https://t.me/${botUsername}?start=${student.telegram_link_code}`
    : null;

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section aria-labelledby="telegram-title" className="flex flex-col gap-3">
      <h2 id="telegram-title" className="flex items-center gap-2 text-headline text-text">
        {t("title")}
        <StatusPill tone={student.telegram_chat_id ? "success" : "neutral"} icon={student.telegram_chat_id ? Send : undefined}>
          {t(student.telegram_chat_id ? "linked" : "notLinked")}
        </StatusPill>
      </h2>
      {link ? (
        <div className="flex flex-col gap-3 rounded-card border border-border p-4">
          <p className="text-footnote text-text-secondary">{t("hint")}</p>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            data-telegram-link
            className="rounded-inner text-body break-all text-purple outline-none hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
          >
            {link}
          </a>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {t(copied ? "copied" : "copy")}
            </Button>
            <Button onClick={() => setShowQr((shown) => !shown)} aria-expanded={showQr}>
              <QrIcon aria-hidden />
              {t(showQr ? "hideQr" : "showQr")}
            </Button>
          </div>
          {showQr ? <QrCode value={link} label={t("qrLabel")} className="size-48 text-text" /> : null}
        </div>
      ) : (
        <p className="rounded-card border border-border p-4 text-body text-text-secondary">{t("noBot")}</p>
      )}
    </section>
  );
}

/** Contacts, groups with fee and discount, and the Telegram link. */
export function OverviewTab({
  student,
  botUsername,
  openGroups,
  today,
}: {
  student: StudentDetail;
  botUsername: string | null;
  openGroups: OpenGroup[];
  today: string;
}) {
  const t = useTranslations("students");
  const tDays = useTranslations("common.weekdays");
  const tLanguage = useTranslations("language");
  const locale = useLocale();
  const [transfer, setTransfer] = useState<EnrolTarget | null>(null);
  const [leave, setLeave] = useState<LeaveTarget | null>(null);
  const person = { id: student.id, full_name: student.full_name, phone: student.phone };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="contacts-title" className="flex flex-col gap-2">
        <h2 id="contacts-title" className="text-headline text-text">
          {t("contacts")}
        </h2>
        <dl className="divide-y divide-border border-y border-border">
          <Detail label={t("fields.phone")}>
            <a href={`tel:${student.phone}`} className={phoneLink}>
              {formatPhone(student.phone)}
            </a>
          </Detail>
          {student.parent_name ? <Detail label={t("fields.parentName")}>{student.parent_name}</Detail> : null}
          {student.parent_phone ? (
            <Detail label={t("fields.parentPhone")}>
              <a href={`tel:${student.parent_phone}`} className={phoneLink}>
                {formatPhone(student.parent_phone)}
              </a>
            </Detail>
          ) : null}
          {student.birth_date ? (
            <Detail label={t("fields.birthDate")}>
              {formatDay(student.birth_date, locale, { year: true, month: "long" })}
            </Detail>
          ) : null}
          <Detail label={t("fields.language")}>{tLanguage(student.language)}</Detail>
          {student.lead_id ? (
            <Detail label={t("fields.lead")}>
              <Link
                href={`/leads?lead=${student.lead_id}`}
                className="rounded-inner text-purple outline-none hover:text-purple-hover focus-visible:ring-3 focus-visible:ring-focus-ring"
              >
                {t("openLead")}
              </Link>
            </Detail>
          ) : null}
          {student.notes ? (
            <Detail label={t("fields.notes")}>
              <span className="whitespace-pre-wrap">{student.notes}</span>
            </Detail>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="groups-title" className="flex flex-col gap-2">
        <h2 id="groups-title" className="flex items-center gap-2 text-headline text-text">
          {t("fields.groups")}
          <Badge>{student.enrolments.filter((enrolment) => enrolment.status === "active").length}</Badge>
        </h2>
        {student.enrolments.length === 0 ? (
          <p className="border-y border-border py-4 text-body text-text-secondary">{t("noGroups")}</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {student.enrolments.map((enrolment) => (
              <li
                key={enrolment.id}
                data-enrolment={enrolment.status}
                className="flex items-start justify-between gap-3 py-2"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-body text-text">
                    <span className="truncate">{enrolment.group?.name ?? "—"}</span>
                    {enrolment.status === "left" ? <StatusPill>{t("enrolment.left")}</StatusPill> : null}
                  </span>
                  <span className="text-footnote text-text-secondary numeric">
                    {enrolment.group
                      ? `${enrolment.group.days.map((day) => tDays(String(day) as Weekday)).join(", ")} · ${enrolment.group.start_time.slice(0, 5)}`
                      : null}
                  </span>
                  <span className="text-footnote text-text-secondary numeric">
                    {enrolment.left_on
                      ? t("enrolment.period", {
                          from: formatDay(enrolment.joined_on, locale, { year: true }),
                          to: formatDay(enrolment.left_on, locale, { year: true }),
                        })
                      : t("enrolment.since", { date: formatDay(enrolment.joined_on, locale, { year: true }) })}
                  </span>
                </span>
                {enrolment.group ? (
                  <span className="flex shrink-0 flex-col items-end text-body">
                    <span>
                      <MoneyText amount={enrolment.group.monthly_fee} />
                    </span>
                    {enrolment.discount_kind && enrolment.discount_value ? (
                      <span className="text-footnote text-text-secondary">
                        {t("enrolment.discount")}{" "}
                        {enrolment.discount_kind === "percent" ? (
                          <span className="numeric">{enrolment.discount_value}%</span>
                        ) : (
                          <MoneyText amount={enrolment.discount_value} />
                        )}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {enrolment.status === "active" && enrolment.group ? (
                  <EnrolmentMenu
                    label={enrolment.group.name}
                    onTransfer={() =>
                      setTransfer({
                        kind: "transfer",
                        enrollmentId: enrolment.id,
                        student: person,
                        fromGroup: { id: enrolment.group!.id, name: enrolment.group!.name },
                        discountKind: enrolment.discount_kind,
                        discountValue: enrolment.discount_value,
                      })
                    }
                    onLeave={() =>
                      setLeave({
                        enrollmentId: enrolment.id,
                        student: person,
                        group: { name: enrolment.group!.name },
                        joinedOn: enrolment.joined_on,
                      })
                    }
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="lg:col-span-2">
        <TelegramCard student={student} botUsername={botUsername} />
      </div>

      <EnrolSheet target={transfer} groups={openGroups} today={today} onClose={() => setTransfer(null)} />
      <LeaveSheet target={leave} today={today} onClose={() => setLeave(null)} />
    </div>
  );
}
