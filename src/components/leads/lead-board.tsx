"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LEAD_STATUSES, canMoveLead, type LeadStatus } from "@/lib/domain/leads";
import type { LeadSummary } from "@/lib/leads/queries";
import { cn } from "@/lib/utils";

import { SOURCE_ICON } from "./lead-meta";
import { NextContact } from "./next-contact";

// The pointer decides while dragging with a mouse or finger; the dragged
// card's rectangle decides while moving with the keyboard.
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

// Left and right arrows jump the card to the next column that accepts it.
const columnJump: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code !== KeyboardCode.Right && event.code !== KeyboardCode.Left) return undefined;
  const { collisionRect, droppableContainers, droppableRects } = context;
  if (!collisionRect) return undefined;

  const columns = droppableContainers
    .getEnabled()
    .map((container) => droppableRects.get(container.id))
    .filter((rect) => rect !== undefined)
    .sort((a, b) => a.left - b.left);
  if (columns.length === 0) return undefined;

  const centre = collisionRect.left + collisionRect.width / 2;
  const direction = event.code === KeyboardCode.Right ? 1 : -1;
  const target =
    direction === 1
      ? columns.find((rect) => rect.left > centre)
      : [...columns].reverse().find((rect) => rect.right < centre);
  if (!target) return undefined;

  event.preventDefault();
  return { x: target.left + 8, y: Math.max(target.top + 44, collisionRect.top) };
};

function CardBody({ lead, now }: { lead: LeadSummary; now: Date }) {
  const t = useTranslations("leads");
  const SourceIcon = SOURCE_ICON[lead.source];
  return (
    <>
      <span className="truncate text-body font-medium text-text">{lead.full_name}</span>
      <span className="truncate text-footnote text-text-secondary">
        {lead.subject_interest ?? t("noSubject")}
      </span>
      <span className="mt-1 flex items-center justify-between gap-2 text-footnote">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-text-secondary">
              <SourceIcon className="size-4" aria-hidden />
              <span className="sr-only">{t(`source.${lead.source}`)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{t(`source.${lead.source}`)}</TooltipContent>
        </Tooltip>
        <NextContact lead={lead} now={now} />
      </span>
    </>
  );
}

const cardClasses =
  "flex w-full flex-col rounded-control border border-border bg-bg px-3 py-2 text-left outline-none motion-fast";

function LeadCard({
  lead,
  now,
  onOpen,
}: {
  lead: LeadSummary;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const locked = lead.status === "won";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { status: lead.status },
    disabled: locked,
  });

  return (
    <li>
      <div
        ref={setNodeRef}
        // A won lead cannot be dragged, but it still opens: do not mark it disabled.
        {...(locked ? {} : attributes)}
        {...(locked ? {} : listeners)}
        role="button"
        tabIndex={0}
        data-lead-card={lead.id}
        onClick={() => onOpen(lead.id)}
        onKeyDown={(event) => {
          // Enter opens the lead; Space is left to dnd-kit to pick the card up.
          if (event.key === "Enter" && !isDragging) {
            event.preventDefault();
            onOpen(lead.id);
            return;
          }
          if (!locked) listeners?.onKeyDown?.(event);
        }}
        className={cn(
          cardClasses,
          "cursor-pointer touch-manipulation select-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-focus-ring",
          isDragging && "opacity-40",
        )}
      >
        <CardBody lead={lead} now={now} />
      </div>
    </li>
  );
}

function Column({
  status,
  leads,
  now,
  onOpen,
  droppable,
}: {
  status: LeadStatus;
  leads: LeadSummary[];
  now: Date;
  onOpen: (id: string) => void;
  /** False while the dragged card cannot be dropped here. */
  droppable: boolean;
}) {
  const t = useTranslations("leads");
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !droppable });
  const titleId = useId();

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={titleId}
      data-lead-column={status}
      className={cn(
        "flex w-64 shrink-0 snap-start flex-col gap-2 rounded-card border border-transparent bg-bg-subtle p-2 motion-fast shell:w-auto shell:min-w-0 shell:flex-1",
        isOver && "border-border-strong bg-border",
      )}
    >
      <h2 id={titleId} className="flex items-center justify-between gap-2 px-2 pt-1 text-footnote">
        <span className="truncate font-medium text-text">{t(`status.${status}`)}</span>
        <Badge className="bg-bg">{leads.length}</Badge>
      </h2>
      <ul className="flex min-h-16 flex-col gap-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} now={now} onOpen={onOpen} />
        ))}
      </ul>
      {status === "won" || status === "lost" ? (
        <p className="px-2 pb-1 text-caption text-text-secondary">{t("last30Days")}</p>
      ) : null}
    </section>
  );
}

/**
 * Five columns. Drag a card with a mouse or finger, or with the keyboard:
 * Space picks it up, ← → choose the column, Space drops, Esc cancels.
 */
export function LeadBoard({
  leads,
  now,
  onOpen,
  onMove,
}: {
  leads: LeadSummary[];
  now: Date;
  onOpen: (id: string) => void;
  onMove: (lead: LeadSummary, to: LeadStatus) => void;
}) {
  const t = useTranslations("leads");
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = leads.find((lead) => lead.id === activeId) ?? null;
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnJump,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    }),
  );

  const name = (id: string | number) => leads.find((lead) => lead.id === id)?.full_name ?? "";
  const column = (id: string | number | undefined) =>
    LEAD_STATUSES.includes(id as LeadStatus) ? t(`status.${id as LeadStatus}`) : "";

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    setActiveId(null);
    const lead = leads.find((candidate) => candidate.id === dragged.id);
    const to = over?.id as LeadStatus | undefined;
    if (lead && to && canMoveLead(lead.status, to)) onMove(lead, to);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active: dragged }) => setActiveId(String(dragged.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        screenReaderInstructions: { draggable: t("dnd.instructions") },
        announcements: {
          onDragStart: ({ active: dragged }) => t("dnd.pickedUp", { name: name(dragged.id) }),
          onDragOver: ({ active: dragged, over }) =>
            over ? t("dnd.over", { name: name(dragged.id), column: column(over.id) }) : undefined,
          onDragEnd: ({ active: dragged, over }) =>
            over
              ? t("dnd.dropped", { name: name(dragged.id), column: column(over.id) })
              : t("dnd.cancelled", { name: name(dragged.id) }),
          onDragCancel: ({ active: dragged }) => t("dnd.cancelled", { name: name(dragged.id) }),
        },
      }}
    >
      {/* relative: keeps the visually hidden text inside this scroller */}
      <div className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8 shell:mx-0 shell:px-0">
        {LEAD_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            leads={leads.filter((lead) => lead.status === status)}
            now={now}
            onOpen={onOpen}
            droppable={active ? canMoveLead(active.status, status) : status !== "won"}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className={cn(cardClasses, "w-60 cursor-grabbing shadow-float")}>
            <CardBody lead={active} now={now} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
