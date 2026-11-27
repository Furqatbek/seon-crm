"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SESSIONS_AHEAD_DAYS, SESSIONS_BACK_DAYS, addDays, sessionsOf } from "@/lib/domain/open-lessons";
import { formatDay, formatPhone } from "@/lib/format";
import { archiveSlot, markOpenLesson, saveSlot } from "@/lib/offers/actions";
import type { OpenLessonSlot, OpenLessonsData, SessionBooking } from "@/lib/offers/queries";
import { SLOT_LEVELS, slotSchema, type OfferErrorKey, type SlotInput, type SlotValues } from "@/lib/validation/offers";

type Role = "owner" | "manager" | "teacher";
type TeacherOption = { id: string; full_name: string };
const NO_TEACHER = "none";
const BOOKING_TONE = { booked: "brand", came: "success", no_show: "danger", cancelled: "neutral" } as const;

function SlotForm({ slot, teachers, owner, onClose }: { slot: OpenLessonSlot | null; teachers: TeacherOption[]; owner: boolean; onClose: () => void }) {
  const t = useTranslations("offers.slots");
  const tErrors = useTranslations("offers.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<OfferErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SlotInput, unknown, SlotValues>({
    resolver: zodResolver(slotSchema),
    defaultValues: slot
      ? { id: slot.id, title: slot.title, korean_level: slot.korean_level ?? "any", weekday: slot.weekday, start_time: slot.start_time, duration_min: slot.duration_min, room: slot.room ?? "", teacher_id: slot.teacher_id ?? "", seats: slot.seats, is_active: slot.is_active }
      : { title: "", korean_level: "any", weekday: 6, start_time: "11:00", duration_min: 60, room: "", teacher_id: "", seats: 10, is_active: true },
  });
  const firstError = errors.title?.message ?? errors.start_time?.message ?? errors.duration_min?.message ?? errors.seats?.message ?? errors.room?.message;

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await saveSlot(values);
      if (!result.ok) return setError(result.error);
      toast(t("saved"));
      onClose();
    });
  });

  function archive() {
    if (!slot) return;
    startTransition(async () => {
      const result = await archiveSlot({ id: slot.id });
      if (!result.ok) return setError(result.error);
      toast(t("archived"));
      onClose();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("title")} htmlFor="slot-title">
          <Input id="slot-title" autoComplete="off" maxLength={120} aria-invalid={errors.title ? true : undefined} {...register("title")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("level")} htmlFor="slot-level">
            <Controller
              control={control}
              name="korean_level"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="slot-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLOT_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {t(`levels.${level}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label={t("weekday")} htmlFor="slot-weekday">
            <Controller
              control={control}
              name="weekday"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                  <SelectTrigger id="slot-weekday">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {tCommon(`weekdays.${day as 1}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label={t("startTime")} htmlFor="slot-time">
            <Input id="slot-time" type="time" className="numeric" aria-invalid={errors.start_time ? true : undefined} {...register("start_time")} />
          </Field>
          <Field label={t("duration")} htmlFor="slot-duration">
            <Input id="slot-duration" type="number" min={15} max={240} inputMode="numeric" className="numeric" aria-invalid={errors.duration_min ? true : undefined} {...register("duration_min")} />
          </Field>
          <Field label={t("seats")} htmlFor="slot-seats">
            <Input id="slot-seats" type="number" min={1} max={200} inputMode="numeric" className="numeric" aria-invalid={errors.seats ? true : undefined} {...register("seats")} />
          </Field>
          <Field label={t("room")} htmlFor="slot-room">
            <Input id="slot-room" autoComplete="off" maxLength={60} {...register("room")} />
          </Field>
        </div>
        <Field label={t("teacher")} htmlFor="slot-teacher">
          <Controller
            control={control}
            name="teacher_id"
            render={({ field }) => (
              <Select value={field.value || NO_TEACHER} onValueChange={(value) => field.onChange(value === NO_TEACHER ? "" : value)}>
                <SelectTrigger id="slot-teacher">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEACHER}>{t("noTeacher")}</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-card border border-border p-3">
          <label htmlFor="slot-active" className="flex flex-col gap-1">
            <span className="text-body font-medium text-text">{t("active")}</span>
            <span className="text-footnote text-text-secondary">{t("activeHint")}</span>
          </label>
          <Controller control={control} name="is_active" render={({ field }) => <Switch id="slot-active" checked={field.value} onCheckedChange={field.onChange} />} />
        </div>
        {error || firstError ? (
          <p role="alert" className="text-footnote text-danger">
            {tErrors((error ?? firstError) as OfferErrorKey)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        {slot && owner ? (
          <Button variant="ghost" disabled={pending} onClick={archive} className="mr-auto">
            {t("archive")}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** One person on a session's list, with Came and No-show for the owner and managers. */
function BookingRow({ booking, staff }: { booking: SessionBooking; staff: boolean }) {
  const t = useTranslations("offers.sessions");
  const tStatus = useTranslations("offers.bookingStatus");
  const [pending, startTransition] = useTransition();
  const mark = (status: "booked" | "came" | "no_show") =>
    startTransition(async () => {
      const result = await markOpenLesson({ booking_id: booking.id, status });
      if (!result.ok) toast.error(t("markFailed"));
    });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-booking={booking.status}>
      <span className="flex min-w-0 flex-col">
        {booking.lead_id && staff ? (
          <Link href={`/leads?lead=${booking.lead_id}`} className="text-body font-medium text-brand-ink hover:underline">
            {booking.name ?? t("someone")}
          </Link>
        ) : (
          <span className="text-body font-medium text-text">{booking.name ?? t("someone")}</span>
        )}
        {booking.phone ? <span className="text-footnote text-text-secondary numeric">{formatPhone(booking.phone)}</span> : null}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusPill tone={BOOKING_TONE[booking.status]}>{tStatus(booking.status)}</StatusPill>
        {staff ? (
          <SegmentedControl
            aria-label={t("mark")}
            disabled={pending}
            value={booking.status === "cancelled" ? "booked" : booking.status}
            onValueChange={mark}
            options={[
              { value: "booked", label: t("notMarked") },
              { value: "came", label: tStatus("came") },
              { value: "no_show", label: tStatus("no_show") },
            ]}
          />
        ) : null}
      </span>
    </li>
  );
}

/**
 * Leads → Open lessons: the weekly slots, and each session's list with Came /
 * No-show. A teacher gets the same screen for their own slots, without the
 * editor and without the marks.
 */
export function OpenLessonsScreen({ data, teachers, today, role }: { data: OpenLessonsData; teachers: TeacherOption[]; today: string; role: Role }) {
  const t = useTranslations("offers");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const staff = role !== "teacher";
  const [editing, setEditing] = useState<OpenLessonSlot | "new" | null>(null);
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");

  const slotOf = new Map(data.slots.map((slot) => [slot.id, slot]));
  const bookingsOf = (slotId: string, date: string) => data.bookings.filter((booking) => booking.slot_id === slotId && booking.session_date === date);
  // Coming sessions of the slots that are on; past ones only where somebody had booked.
  const upcoming = sessionsOf(data.slots.filter((slot) => slot.is_active), today, SESSIONS_AHEAD_DAYS + 1);
  const past = sessionsOf(data.slots, addDays(today, -SESSIONS_BACK_DAYS), SESSIONS_BACK_DAYS)
    .filter((session) => bookingsOf(session.slotId, session.date).length > 0)
    .reverse();
  const sessions = when === "upcoming" ? upcoming : past;

  return (
    <div className="flex flex-col gap-8" data-slot="open-lessons">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-headline text-text">{t("slots.heading")}</h2>
          {staff ? (
            <Button variant="primary" onClick={() => setEditing("new")}>
              <Plus aria-hidden />
              {t("slots.add")}
            </Button>
          ) : null}
        </div>
        {data.slots.length === 0 ? (
          <EmptyState icon={CalendarDays}>{t(staff ? "slots.empty" : "slots.emptyTeacher")}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("slots.title")}</TableHead>
                <TableHead>{t("slots.when")}</TableHead>
                <TableHead>{t("slots.level")}</TableHead>
                <TableHead>{t("slots.teacher")}</TableHead>
                <TableHead>{t("slots.room")}</TableHead>
                <TableHead className="text-right">{t("slots.seats")}</TableHead>
                <TableHead>{t("slots.state")}</TableHead>
                {staff ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.slots.map((slot) => (
                <TableRow key={slot.id} data-slot-id={slot.id}>
                  <TableCell className="font-medium whitespace-nowrap text-text">{slot.title}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {tCommon(`weekdays.${slot.weekday as 1}`)}, <span className="numeric">{slot.start_time}</span> · {t("slots.minutes", { minutes: slot.duration_min })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t(`slots.levels.${slot.korean_level ?? "any"}`)}</TableCell>
                  <TableCell className="whitespace-nowrap">{slot.teacher ?? "—"}</TableCell>
                  <TableCell>{slot.room ?? "—"}</TableCell>
                  <TableCell className="numeric text-right">{slot.seats}</TableCell>
                  <TableCell>
                    <StatusPill tone={slot.is_active ? "success" : "neutral"}>{t(slot.is_active ? "slots.on" : "slots.off")}</StatusPill>
                  </TableCell>
                  {staff ? (
                    <TableCell>
                      <Button variant="ghost" onClick={() => setEditing(slot)} aria-label={t("slots.edit", { title: slot.title })}>
                        <Pencil aria-hidden />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-headline text-text">{t("sessions.heading")}</h2>
          <SegmentedControl
            aria-label={t("sessions.heading")}
            value={when}
            onValueChange={setWhen}
            options={[
              { value: "upcoming", label: t("sessions.upcoming") },
              { value: "past", label: t("sessions.past") },
            ]}
          />
        </div>
        {sessions.length === 0 ? (
          <p className="text-body text-text-secondary">{t(when === "upcoming" ? "sessions.emptyUpcoming" : "sessions.emptyPast")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => {
              const slot = slotOf.get(session.slotId);
              if (!slot) return null;
              const booked = bookingsOf(session.slotId, session.date);
              return (
                <li key={`${session.slotId}-${session.date}`} className="rounded-card border border-border p-3" data-session={session.date}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-medium text-text">
                      {formatDay(session.date, locale, { month: "long" })}, {tCommon(`weekdays.${slot.weekday as 1}`)} · <span className="numeric">{session.startTime}</span> · {slot.title}
                    </p>
                    <p className="text-footnote text-text-secondary numeric" data-seats>
                      {t("sessions.booked", { booked: booked.length, seats: slot.seats })}
                    </p>
                  </div>
                  {booked.length > 0 ? (
                    <ul className="mt-1 divide-y divide-border">
                      {booked.map((booking) => (
                        <BookingRow key={booking.id} booking={booking} staff={staff} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t(editing === "new" ? "slots.add" : "slots.editTitle")}</SheetTitle>
          </SheetHeader>
          {editing !== null ? (
            <SlotForm key={editing === "new" ? "new" : editing.id} slot={editing === "new" ? null : editing} teachers={teachers} owner={role === "owner"} onClose={() => setEditing(null)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
