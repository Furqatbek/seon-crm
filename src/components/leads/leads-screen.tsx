"use client";

import { Plus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { UserRole } from "@/lib/auth";
import { canMoveLead, type LeadStatus } from "@/lib/domain/leads";
import { moveLead } from "@/lib/leads/actions";
import type { GroupOption, LeadDetail, LeadSummary, StaffOption } from "@/lib/leads/queries";
import type { LeadsSearch } from "@/lib/validation/leads";

import { FollowUpStrip } from "./follow-up-strip";
import { LeadBoard } from "./lead-board";
import { LeadFormSheet } from "./lead-form-sheet";
import { LeadList } from "./lead-list";
import { LeadSheet } from "./lead-sheet";
import { LeadsToolbar } from "./leads-toolbar";
import { MoveDialog, type PendingMove } from "./move-dialog";
import { useLeadsUrl } from "./use-leads-url";

type Movable = { id: string; full_name: string; status: LeadStatus };

export function LeadsScreen({
  search,
  board,
  list,
  followUps,
  selected,
  staff,
  groups,
  user,
  nowIso,
}: {
  search: LeadsSearch;
  board: LeadSummary[] | null;
  list: { rows: LeadSummary[]; total: number } | null;
  followUps: LeadSummary[];
  selected: LeadDetail | null;
  /** Everyone, for names in the timeline; only active staff can be assigned. */
  staff: Array<StaffOption & { is_active: boolean }>;
  groups: GroupOption[];
  user: { id: string; role: UserRole };
  nowIso: string;
}) {
  const t = useTranslations("leads");
  const tNav = useTranslations("nav");
  const tEmpty = useTranslations("empty");
  const { openLead, closeLead, setParams } = useLeadsUrl();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const activeStaff = useMemo(() => staff.filter((person) => person.is_active), [staff]);

  const [form, setForm] = useState<{ lead: LeadDetail | null } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [, startTransition] = useTransition();
  const [boardLeads, moveOnBoard] = useOptimistic(
    board ?? [],
    (state, move: { id: string; status: LeadStatus }) =>
      state.map((lead) => (lead.id === move.id ? { ...lead, status: move.status } : lead)),
  );

  function requestMove(lead: Movable, to: LeadStatus) {
    if (!canMoveLead(lead.status, to)) return;
    // Lost needs a reason and Trial a group and date: ask first.
    if (to === "lost" || to === "trial") {
      setPendingMove({ lead: { id: lead.id, full_name: lead.full_name }, to });
      return;
    }
    startTransition(async () => {
      moveOnBoard({ id: lead.id, status: to });
      const result = await moveLead({ id: lead.id, to });
      if (!result.ok) toast(t(`errors.${result.error}`));
    });
  }

  const filtered = Boolean(search.q || search.source || search.assigned);
  const count = search.view === "board" ? boardLeads.length : (list?.total ?? 0);

  return (
    <>
      <PageHeader
        title={tNav("leads")}
        action={
          <Button variant="primary" onClick={() => setForm({ lead: null })}>
            <Plus aria-hidden />
            {t("newLead")}
          </Button>
        }
      >
        <LeadsToolbar search={search} staff={activeStaff} />
      </PageHeader>

      <FollowUpStrip leads={followUps} now={now} onOpen={openLead} />

      {count === 0 ? (
        <EmptyState
          icon={UserPlus}
          action={
            filtered ? (
              <Button onClick={() => setParams({ q: null, source: null, assigned: null, page: null })}>
                {t("clearFilters")}
              </Button>
            ) : (
              <Button onClick={() => setForm({ lead: null })}>{t("newLead")}</Button>
            )
          }
        >
          {filtered ? t("noMatches") : tEmpty("leads")}
        </EmptyState>
      ) : search.view === "board" ? (
        <LeadBoard leads={boardLeads} now={now} onOpen={openLead} onMove={requestMove} />
      ) : (
        <LeadList
          rows={list?.rows ?? []}
          total={list?.total ?? 0}
          page={search.page}
          staff={staff}
          now={now}
          onOpen={openLead}
        />
      )}

      <LeadSheet
        lead={form?.lead ? null : selected}
        staff={staff}
        groups={groups}
        role={user.role}
        now={now}
        onClose={closeLead}
        onEdit={() => selected && setForm({ lead: selected })}
        onMove={requestMove}
      />
      <LeadFormSheet
        open={form !== null}
        lead={form?.lead ?? null}
        staff={activeStaff}
        defaultAssignee={user.id}
        onClose={() => setForm(null)}
      />
      <MoveDialog move={pendingMove} groups={groups} onClose={() => setPendingMove(null)} />
    </>
  );
}
