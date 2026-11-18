"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Gift, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PointsText } from "@/components/points/points-text";
import { presetLabel } from "@/components/points/preset-label";
import { RedeemSheet } from "@/components/points/redeem-sheet";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UserRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { adjustPoints, setLeaderboardHidden } from "@/lib/points/actions";
import type { Reward, StudentPoints, StudentPointsRow } from "@/lib/points/queries";
import { adjustSchema, type AdjustInput, type AdjustValues, type PointsErrorKey } from "@/lib/validation/points";

function AdjustForm({ studentId, balance, onClose }: { studentId: string; balance: number; onClose: () => void }) {
  const t = useTranslations("points");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PointsErrorKey | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AdjustInput, unknown, AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { student_id: studentId, kind: "add", amount: "", reason: "" },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as PointsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setError(null);
    if (values.kind === "take" && values.amount > balance) return setError("notEnough");
    startTransition(async () => {
      const result = await adjustPoints(values);
      if (!result.ok) return setError(result.error);
      toast(t("adjust.done"));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("adjust.kind")} htmlFor="adjust-kind">
          <Controller
            control={control}
            name="kind"
            render={({ field }) => (
              <SegmentedControl
                aria-label={t("adjust.kind")}
                fullWidth
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: "add", label: t("adjust.add") },
                  { value: "take", label: t("adjust.take") },
                ]}
              />
            )}
          />
        </Field>
        <Field label={t("howMany")} htmlFor="adjust-amount" error={message(errors.amount?.message)}>
          <Input id="adjust-amount" inputMode="numeric" autoComplete="off" className="numeric" aria-invalid={errors.amount ? true : undefined} {...register("amount")} />
        </Field>
        <Field label={t("reason")} htmlFor="adjust-reason" error={message(errors.reason?.message)}>
          <Input id="adjust-reason" autoComplete="off" maxLength={200} aria-invalid={errors.reason ? true : undefined} {...register("reason")} />
        </Field>
        {error ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
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

/**
 * A student's points: what they can spend, what they earned, and every row of
 * the ledger, newest first. The owner can adjust the points with a reason.
 */
export function PointsTab({
  studentId,
  studentName,
  points,
  rewards,
  role,
  enabled,
}: {
  studentId: string;
  studentName: string;
  points: StudentPoints;
  /** The rewards on offer, for a desk request. */
  rewards: Reward[];
  role: UserRole;
  /** False while the programme is switched off in Settings. */
  enabled: boolean;
}) {
  const t = useTranslations("points");
  const locale = useLocale();
  const [adjusting, setAdjusting] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [hiding, startHiding] = useTransition();

  function setHidden(hidden: boolean) {
    startHiding(async () => {
      const result = await setLeaderboardHidden(studentId, hidden);
      toast(result.ok ? t(hidden ? "hide.hidden" : "hide.shown") : t(`errors.${result.error}`));
    });
  }

  const detail = (row: StudentPointsRow) =>
    row.preset ? presetLabel(row.preset, locale) : row.source === "referral" && row.reason ? t("friend", { name: row.reason }) : row.reason;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-stretch gap-3">
        {(
          [
            ["balance", points.balance],
            ["earnedThisMonth", points.earnedThisMonth],
            ["earnedAllTime", points.earnedAllTime],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="flex min-w-40 flex-1 flex-col gap-1 rounded-card border border-border p-4 sm:flex-none" data-points-total={key} data-value={value}>
            <span className="text-footnote text-text-secondary">{t(`totals.${key}`)}</span>
            <span className="text-title text-text numeric">{value}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2 self-end sm:ml-auto">
          <Button variant="primary" onClick={() => setRedeeming(true)}>
            <Gift aria-hidden />
            {t("redeem.open")}
          </Button>
          {role === "owner" && enabled ? (
            <Button onClick={() => setAdjusting(true)}>
              <SlidersHorizontal aria-hidden />
              {t("adjust.action")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex max-w-xl items-center justify-between gap-4 rounded-card border border-border p-4">
        <label htmlFor="leaderboard-hidden" className="flex flex-col gap-1">
          <span className="text-body font-medium text-text">{t("hide.label")}</span>
          <span className="text-footnote text-text-secondary">{t("hide.hint")}</span>
        </label>
        <Switch id="leaderboard-hidden" checked={points.hidden} disabled={hiding} onCheckedChange={setHidden} />
      </div>

      {enabled ? null : (
        <p className="rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">{t("programmeOff")}</p>
      )}

      {points.rows.length === 0 ? (
        <p className="rounded-card border border-border px-4 py-6 text-center text-body text-text-secondary">{t("ledger.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ledger.date")}</TableHead>
              <TableHead>{t("ledger.what")}</TableHead>
              <TableHead>{t("ledger.by")}</TableHead>
              <TableHead numeric>{t("ledger.points")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.rows.map((row) => (
              <TableRow key={row.id} data-points-row={row.source} data-delta={row.delta}>
                <TableCell className="whitespace-nowrap numeric">{formatDateTime(row.at, locale)}</TableCell>
                <TableCell>
                  <span className="flex min-w-48 flex-col py-1">
                    <span className="flex flex-wrap items-center gap-2">
                      {t(`source.${row.source}`)}
                      {row.isUndo ? <StatusPill>{t("history.undone")}</StatusPill> : null}
                    </span>
                    <span className="text-footnote text-text-secondary">
                      {[detail(row), row.group].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-text-secondary">{row.by ?? t("ledger.automatic")}</TableCell>
                <TableCell numeric>
                  <PointsText value={row.delta} signed />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RedeemSheet
        open={redeeming}
        student={{ id: studentId, name: studentName }}
        balance={points.balance}
        rewards={rewards}
        onClose={() => setRedeeming(false)}
      />

      <Sheet open={adjusting} onOpenChange={(open) => !open && setAdjusting(false)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("adjust.title", { name: studentName })}</SheetTitle>
            <SheetDescription>{t("adjust.hint", { count: points.balance })}</SheetDescription>
          </SheetHeader>
          {adjusting ? <AdjustForm studentId={studentId} balance={points.balance} onClose={() => setAdjusting(false)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
