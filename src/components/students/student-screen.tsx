"use client";

import {
  Archive,
  ChevronLeft,
  Ellipsis,
  LogOut,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  UserPlus,
  Wallet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { EnrolSheet } from "@/components/enrolments/enrol-sheet";
import { SoonButton } from "@/components/shared/soon-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import type { UserRole } from "@/lib/auth";
import type { BalanceState } from "@/lib/domain/ledger";
import { useUrlState } from "@/lib/hooks/use-url-state";
import { archiveStudent, markStudentLeft, setStudentStatus } from "@/lib/students/actions";
import type { OpenGroup } from "@/lib/groups/queries";
import type { StudentDetail } from "@/lib/students/queries";
import { STUDENT_TABS, type StudentErrorKey, type StudentTab } from "@/lib/validation/students";

import { BalanceText } from "./balance-text";
import { StudentFormSheet } from "./student-form-sheet";
import { STUDENT_TONE } from "./student-meta";

type Confirm = "left" | "archive";

/**
 * The student page frame: header with status and balance, actions, and the
 * tab bar. The active tab's content is rendered on the server and passed in.
 */
export function StudentScreen({
  student,
  balanceState,
  role,
  tab,
  openGroups,
  today,
  autoEnrol,
  children,
}: {
  student: StudentDetail;
  balanceState: BalanceState;
  role: UserRole;
  tab: StudentTab;
  openGroups: OpenGroup[];
  /** "YYYY-MM-DD" in Tashkent. */
  today: string;
  /** Open the enrol sheet straight away (after New student or Convert). */
  autoEnrol: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("students");
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { setParams } = useUrlState();
  const [editing, setEditing] = useState(false);
  const [enrolling, setEnrolling] = useState(autoEnrol);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pending, startTransition] = useTransition();
  // The tab bar follows the click at once; the content follows when it has loaded.
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: StudentErrorKey }>, done: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      setConfirm(null);
      if (!result.ok) return void toast(t(`errors.${result.error}`));
      toast(done);
      after?.();
    });
  }

  return (
    <>
      <Link
        href="/students"
        className="mb-2 inline-flex items-center gap-1 rounded-inner text-footnote text-text-secondary outline-none motion-fast hover:text-text focus-visible:ring-3 focus-visible:ring-focus-ring"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {tNav("students")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {student.full_name}
            <StatusPill tone={STUDENT_TONE[student.status]} className="align-middle" >
              <span data-student-status={student.status}>{t(`status.${student.status}`)}</span>
            </StatusPill>
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Enabled with Finance (payments) and Notifications (messages). */}
            <SoonButton variant="primary" hint={t("soon.payment")}>
              <Wallet aria-hidden />
              {t("actions.takePayment")}
            </SoonButton>
            <Button onClick={() => setEnrolling(true)}>
              <UserPlus aria-hidden />
              {t("actions.enrol")}
            </Button>
            <SoonButton hint={t("soon.message")}>
              <MessageSquare aria-hidden />
              {t("actions.sendMessage")}
            </SoonButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" aria-label={t("actions.more")}>
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  {t("actions.edit")}
                </DropdownMenuItem>
                {student.status === "active" ? (
                  <DropdownMenuItem
                    onSelect={() => run(() => setStudentStatus(student.id, "paused"), t("done.paused"))}
                  >
                    <Pause aria-hidden />
                    {t("actions.pause")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => run(() => setStudentStatus(student.id, "active"), t("done.resumed"))}
                  >
                    <Play aria-hidden />
                    {t("actions.resume")}
                  </DropdownMenuItem>
                )}
                {student.status === "left" ? null : (
                  <DropdownMenuItem onSelect={() => setConfirm("left")}>
                    <LogOut aria-hidden />
                    {t("actions.markLeft")}
                  </DropdownMenuItem>
                )}
                {role === "owner" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("archive")}>
                      <Archive aria-hidden />
                      {t("actions.archive")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="mb-6 flex w-fit min-w-56 flex-col gap-1 rounded-card border border-border p-4" data-slot="student-balance">
        <span className="text-footnote text-text-secondary">{t("fields.balance")}</span>
        <BalanceText balance={student.balance} state={balanceState} className="justify-start text-title" />
      </div>

      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as StudentTab);
            setParams({ tab: value === "overview" ? null : value, month: null });
          })
        }
        className="gap-6"
      >
        <TabsList>
          {STUDENT_TABS.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`tabs.${name}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>

      <EnrolSheet
        target={
          enrolling
            ? { kind: "enrol", student: { id: student.id, full_name: student.full_name, phone: student.phone } }
            : null
        }
        groups={openGroups.filter(
          (group) =>
            !student.enrolments.some(
              (enrolment) => enrolment.status === "active" && enrolment.group?.id === group.id,
            ),
        )}
        today={today}
        onClose={() => {
          setEnrolling(false);
          if (autoEnrol) setParams({ enrol: null });
        }}
      />

      <StudentFormSheet
        mode={editing ? { kind: "edit", student } : null}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(confirm === "archive" ? "archive.title" : "left.title", { name: student.full_name })}
            </DialogTitle>
            <DialogDescription>{t(confirm === "archive" ? "archive.body" : "left.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive-fill"
              disabled={pending}
              onClick={() =>
                confirm === "archive"
                  ? run(() => archiveStudent(student.id), t("done.archived"), () => router.push("/students"))
                  : run(() => markStudentLeft(student.id), t("done.left"))
              }
            >
              {t(confirm === "archive" ? "actions.archive" : "actions.markLeft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
