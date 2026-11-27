import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { LeadOfferSection } from "@/components/leads/lead-offer";
import { OpenLessonsScreen } from "@/components/open-lessons/open-lessons-screen";
import { VouchersReport } from "@/components/reports/vouchers-report";
import { VouchersTab } from "@/components/settings/vouchers-tab";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { addDays, isoWeekday } from "@/lib/domain/open-lessons";
import { tashkentDate } from "@/lib/domain/time";
import type { OpenLessonsData } from "@/lib/offers/queries";

type Props = LocaleParams & { searchParams: Promise<{ view?: string; role?: string }> };

async function Preview({ searchParams, locale }: Pick<Props, "searchParams"> & { locale: Locale }) {
  const { view, role } = await searchParams;
  // Today's date is read at request time.
  await connection();
  const today = tashkentDate(new Date());
  // A Saturday slot and a Wednesday one, with people on the nearest Saturday before and after today.
  const saturday = (from: string, step: number) => {
    let day = from;
    while (isoWeekday(day) !== 6) day = addDays(day, step);
    return day;
  };
  const next = saturday(today, 1);
  const last = saturday(addDays(today, -1), -1);
  const data: OpenLessonsData = {
    slots: [
      { id: "sat", title: "Koreys tili: ochiq dars", korean_level: "topik1", weekday: 6, start_time: "11:00", duration_min: 90, room: "101", teacher_id: "t1", teacher: "Malika Tursunova", seats: 10, is_active: true },
      { id: "wed", title: "TOPIK II: ochiq dars", korean_level: "topik2", weekday: 3, start_time: "18:30", duration_min: 60, room: "204", teacher_id: null, teacher: null, seats: 8, is_active: false },
    ],
    bookings: [
      { id: "b1", slot_id: "sat", session_date: next, status: "booked", lead_id: "lead-1", name: role === "teacher" ? null : "Bekzod Aliyev", phone: role === "teacher" ? null : "+998935551234" },
      { id: "b2", slot_id: "sat", session_date: next, status: "booked", lead_id: "lead-2", name: role === "teacher" ? null : "Sardor Murodov", phone: role === "teacher" ? null : "+998901112233" },
      { id: "b3", slot_id: "sat", session_date: last, status: "came", lead_id: "lead-3", name: role === "teacher" ? null : "Dilnoza Karimova", phone: role === "teacher" ? null : "+998977778899" },
      { id: "b4", slot_id: "sat", session_date: last, status: "no_show", lead_id: "lead-4", name: role === "teacher" ? null : "Jasur Toshmatov", phone: role === "teacher" ? null : "+998946665544" },
    ],
  };
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 sm:p-8">
      {view === "settings" ? (
        <>
          <PageHeader title="Settings → Vouchers" />
          <VouchersTab settings={{ percent_enabled: true, percent_weight: 1, percent_value: 20, fixed_enabled: true, fixed_weight: 1, fixed_value: 100000, trial_enabled: true, trial_weight: 1, trial_value: 7, valid_days: 14 }} />
        </>
      ) : view === "report" ? (
        <>
          <PageHeader title="Reports → Vouchers" />
          <VouchersReport
            locale={locale}
            app={{
              signups: [
                { week: "2026-11-09", count: 18 },
                { week: "2026-11-16", count: 24 },
                { week: "2026-11-23", count: 31 },
              ],
              exams: [
                { exam_id: "e1", title: "TOPIK I — Mock 1", attempts: 42, players: 35, average_correct: 21.4, questions: 40 },
                { exam_id: "e2", title: "TOPIK II — Mock 1", attempts: 17, players: 15, average_correct: 28.9, questions: 50 },
              ],
            }}
            rows={[
              { type: "percent", issued: 14, redeemed: 5, expired: 3 },
              { type: "fixed", issued: 11, redeemed: 2, expired: 4 },
              { type: "trial_week", issued: 12, redeemed: 6, expired: 1 },
            ]}
          />
        </>
      ) : view === "lead" ? (
        <div className="max-w-md">
          <LeadOfferSection
            locale={locale}
            offer={{
              voucher: { code: "KOR-7F3K9", type: "percent", value: 20, status: "issued", expires_at: "2026-12-07T10:00:00Z", redeemed_at: null },
              bookings: [
                { id: "1", title: "Koreys tili: ochiq dars", session_date: next, start_time: "11:00", status: "booked" },
                { id: "2", title: "Koreys tili: ochiq dars", session_date: last, start_time: "11:00", status: "no_show" },
              ],
            }}
          />
        </div>
      ) : (
        <>
          <PageHeader title="Leads → Open lessons" />
          <OpenLessonsScreen data={data} teachers={[{ id: "t1", full_name: "Malika Tursunova" }]} today={today} role={role === "teacher" ? "teacher" : role === "manager" ? "manager" : "owner"} />
        </>
      )}
    </div>
  );
}

// Development only: the vouchers and open lessons screens with made-up data,
// without a database. ?view=settings | report | lead; ?role=owner | manager | teacher
export default async function DevOffersPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  const locale = await initLocale(params);
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} locale={locale as Locale} />
    </Suspense>
  );
}
