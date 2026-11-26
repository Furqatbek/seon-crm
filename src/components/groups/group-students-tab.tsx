"use client";

import { UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { CoinsText } from "@/components/coins/coins-text";
import { StaffCoinsSheet, type CoinsTarget } from "@/components/coins/staff-coins-sheet";
import { EnrolSheet, type EnrolTarget } from "@/components/enrolments/enrol-sheet";
import { LeaveSheet, type LeaveTarget } from "@/components/enrolments/leave-sheet";
import { BalanceText } from "@/components/students/balance-text";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { BalanceState } from "@/lib/domain/ledger";
import { formatDay, formatPhone } from "@/lib/format";
import type { GroupStudent, OpenGroup } from "@/lib/groups/queries";

import { EnrolmentMenu } from "./enrolment-menu";

export type GroupStudentRow = Omit<GroupStudent, "marks"> & {
  /** Whole percent in this group, or null when nothing was marked. */
  rate: number | null;
  balanceState: BalanceState;
  /** Earned in this group, what is left to spend, and the place in the group. */
  coins: { earned: number; balance: number; rank: number };
};

/** Balance, attendance %, coins and joined date; a row opens the student. */
export function GroupStudentsTab({
  group,
  rows,
  openGroups,
  today,
}: {
  group: { id: string; name: string };
  rows: GroupStudentRow[];
  openGroups: OpenGroup[];
  today: string;
}) {
  const t = useTranslations("groups");
  const tCoins = useTranslations("coins");
  const locale = useLocale();
  const router = useRouter();
  const [transfer, setTransfer] = useState<EnrolTarget | null>(null);
  const [leave, setLeave] = useState<LeaveTarget | null>(null);
  const [coins, setCoins] = useState<CoinsTarget | null>(null);

  if (rows.length === 0) {
    return <EmptyState icon={UserPlus}>{t("studentsTab.empty")}</EmptyState>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("fields.name")}</TableHead>
            <TableHead>{t("fields.phone")}</TableHead>
            <TableHead numeric>{t("fields.balance")}</TableHead>
            <TableHead numeric>{t("fields.attendance")}</TableHead>
            <TableHead numeric>{tCoins("column")}</TableHead>
            <TableHead>{t("fields.joined")}</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.enrollmentId}
              tabIndex={0}
              data-group-student={row.student.id}
              onClick={() => router.push(`/students/${row.student.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.target === event.currentTarget) {
                  router.push(`/students/${row.student.id}`);
                }
              }}
              className="outline-none focus-visible:[&>td]:bg-bg-subtle"
            >
              <TableCell>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Avatar name={row.student.full_name} />
                  <span className="font-medium">{row.student.full_name}</span>
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap numeric">{formatPhone(row.student.phone)}</TableCell>
              <TableCell numeric>
                <BalanceText balance={row.balance} state={row.balanceState} />
              </TableCell>
              <TableCell numeric data-attendance-rate={row.rate ?? ""}>
                {row.rate === null ? "—" : `${row.rate}%`}
              </TableCell>
              <TableCell numeric data-cell="coins" data-coin-rank={row.coins.earned > 0 ? row.coins.rank : ""}>
                <span className="inline-flex items-center justify-end gap-2">
                  {row.coins.earned > 0 ? (
                    <span className="text-footnote text-text-secondary">{tCoins("placeShort", { place: row.coins.rank })}</span>
                  ) : null}
                  <CoinsText value={row.coins.balance} label={tCoins("count", { count: row.coins.balance })} />
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap numeric">
                {formatDay(row.joinedOn, locale, { year: true })}
              </TableCell>
              <TableCell className="px-1">
                <EnrolmentMenu
                  label={row.student.full_name}
                  onCoins={() => setCoins({ groupId: group.id, student: row.student, balance: row.coins.balance })}
                  onTransfer={() =>
                    setTransfer({
                      kind: "transfer",
                      enrollmentId: row.enrollmentId,
                      student: row.student,
                      fromGroup: group,
                      discountKind: row.discountKind,
                      discountValue: row.discountValue,
                    })
                  }
                  onLeave={() =>
                    setLeave({
                      enrollmentId: row.enrollmentId,
                      student: row.student,
                      group,
                      joinedOn: row.joinedOn,
                    })
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <EnrolSheet target={transfer} groups={openGroups} today={today} onClose={() => setTransfer(null)} />
      <LeaveSheet target={leave} today={today} onClose={() => setLeave(null)} />
      <StaffCoinsSheet target={coins} onClose={() => setCoins(null)} />
    </>
  );
}
