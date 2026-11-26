"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DoorOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { roomLabel } from "@/lib/domain/rooms";
import { archiveRoom, createRoom, updateRoom } from "@/lib/settings/actions";
import type { RoomRow } from "@/lib/settings/queries";
import {
  roomSchema,
  type RoomInput,
  type RoomValues,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;

function RoomForm({ room, onClose }: { room: RoomRow | null; onClose: () => void }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm<RoomInput, unknown, RoomValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: room
      ? { number: room.number, name: room.name ?? "", capacity: room.capacity, is_active: room.is_active }
      : { number: "", name: "", capacity: "", is_active: true },
  });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      // What was typed is sent; the server validates it again.
      const raw = getValues();
      const result = room ? await updateRoom(room.id, raw) : await createRoom(raw);
      if (!result.ok) {
        // These two belong to a field; anything else is shown under the form.
        if (result.error === "numberTaken") return setError("number", { message: result.error });
        if (result.error === "capacityBelowGroup") return setError("capacity", { message: result.error });
        return setFailure(result);
      }
      toast(t(room ? "rooms.saved" : "rooms.created", { room: roomLabel(values) }));
      onClose();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("rooms.number")} htmlFor="room-number" error={message(errors.number?.message)}>
          <Input id="room-number" autoComplete="off" autoFocus={!room} aria-invalid={errors.number ? true : undefined} {...register("number")} />
          <p className="text-footnote text-text-secondary">{t("rooms.numberHint")}</p>
        </Field>
        <Field label={t("rooms.name")} htmlFor="room-name" error={message(errors.name?.message)}>
          <Input id="room-name" autoComplete="off" aria-invalid={errors.name ? true : undefined} {...register("name")} />
          <p className="text-footnote text-text-secondary">{t("rooms.nameHint")}</p>
        </Field>
        <Field label={t("rooms.capacity")} htmlFor="room-capacity" error={message(errors.capacity?.message)} className="sm:max-w-xs">
          <Input id="room-capacity" type="number" min={1} max={500} inputMode="numeric" className="numeric" aria-invalid={errors.capacity ? true : undefined} {...register("capacity")} />
          <p className="text-footnote text-text-secondary">{t("rooms.capacityHint")}</p>
        </Field>
        <div className="flex items-start justify-between gap-4">
          <label htmlFor="room-active" className="flex flex-col gap-0.5">
            <span className="text-body font-medium text-text">{t("rooms.active")}</span>
            <span className="text-footnote text-text-secondary">{t("rooms.activeHint")}</span>
          </label>
          <Controller
            control={control}
            name="is_active"
            render={({ field }) => <Switch id="room-active" checked={field.value} onCheckedChange={field.onChange} />}
          />
        </div>
        <Problem failure={failure} />
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
 * Owner only: the rooms with their number, name, capacity and the groups
 * using them; Add room, Edit room, and Archive when no group uses the room.
 */
export function RoomsTab({ rooms }: { rooms: RoomRow[] }) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  // null: closed. "new": Add room. A room: Edit room.
  const [editing, setEditing] = useState<RoomRow | "new" | null>(null);
  const [archiving, setArchiving] = useState<RoomRow | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, startTransition] = useTransition();

  function archive(room: RoomRow) {
    setFailure(null);
    setArchiving(null);
    startTransition(async () => {
      const result = await archiveRoom(room.id);
      if (!result.ok) setFailure(result);
      else toast(t("rooms.archived", { room: roomLabel(room) }));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Problem failure={failure} />
        <Button variant="primary" onClick={() => setEditing("new")} className="ml-auto w-full sm:w-auto">
          <Plus aria-hidden />
          {t("rooms.add")}
        </Button>
      </div>

      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen}>{t("rooms.empty")}</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("rooms.number")}</TableHead>
              <TableHead>{t("rooms.name")}</TableHead>
              <TableHead numeric>{t("rooms.capacity")}</TableHead>
              <TableHead>{t("rooms.groups")}</TableHead>
              <TableHead>{t("rooms.status")}</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms.map((room) => {
              const inUse = room.groups.length > 0;
              return (
                <TableRow key={room.id} data-room-row={room.number} data-room-in-use={inUse ? "true" : "false"}>
                  <TableCell className="font-medium whitespace-nowrap numeric">{room.number}</TableCell>
                  <TableCell className="whitespace-nowrap">{room.name ?? "—"}</TableCell>
                  <TableCell numeric>{room.capacity}</TableCell>
                  <TableCell>
                    {inUse ? (
                      <span className="flex flex-wrap gap-1 py-2">
                        {room.groups.map((group) => (
                          <Link key={group.id} href={`/groups/${group.id}`} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-focus-ring">
                            <Badge>{group.name}</Badge>
                          </Link>
                        ))}
                      </span>
                    ) : (
                      <span className="text-text-secondary">{t("rooms.noGroups")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={room.is_active ? "success" : "neutral"}>
                      {t(room.is_active ? "rooms.statusActive" : "rooms.statusInactive")}
                    </StatusPill>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center justify-end gap-2">
                      <Button aria-label={t("rooms.editRoom", { room: roomLabel(room) })} onClick={() => setEditing(room)} disabled={busy}>
                        {t("rooms.edit")}
                      </Button>
                      {/* A room in use is not archived: the button says why instead of failing. */}
                      <Button
                        variant="destructive"
                        aria-label={t("rooms.archiveRoom", { room: roomLabel(room) })}
                        title={inUse ? t("rooms.archiveBlocked") : undefined}
                        disabled={busy || inUse}
                        onClick={() => setArchiving(room)}
                      >
                        {t("rooms.archive")}
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Sheet open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editing && editing !== "new" ? t("rooms.editTitle", { room: roomLabel(editing) }) : t("rooms.addTitle")}
            </SheetTitle>
            <SheetDescription className="sr-only">{t("rooms.capacityHint")}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <RoomForm
              key={editing === "new" ? "new" : editing.id}
              room={editing === "new" ? null : editing}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={archiving !== null} onOpenChange={(next) => !next && setArchiving(null)}>
        <DialogContent>
          {archiving ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("rooms.archiveTitle", { room: roomLabel(archiving) })}</DialogTitle>
                <DialogDescription>{t("rooms.archiveBody")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setArchiving(null)}>
                  {tCommon("cancel")}
                </Button>
                <Button variant="destructive-fill" onClick={() => archive(archiving)}>
                  {t("rooms.archive")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
