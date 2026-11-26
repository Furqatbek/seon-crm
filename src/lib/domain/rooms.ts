// Rooms — docs/SPEC.md → "Screens → Groups".
// A room holds one group at a time. Mirrored in SQL: room_clashes() and
// group_uses_room().

export type RoomLabelParts = { number: string; name: string | null };

/** A room as it is shown everywhere: "3 · Katta zal", or just "3" when it has no name. */
export function roomLabel(room: RoomLabelParts): string {
  const name = room.name?.trim();
  return name ? `${room.number} · ${name}` : room.number;
}

/** A weekly lesson slot: weekdays 1 (Mon) … 7 (Sun), a start as "HH:MM", a length in minutes. */
export type Slot = {
  days: readonly number[];
  /** "HH:MM" or "HH:MM:SS" */
  start_time: string;
  duration_min: number;
};

export type RoomGroup = Slot & {
  id: string;
  name: string;
  room_id: string | null;
  status: "forming" | "active" | "finished";
  archived_at: string | null;
};

/** Minutes from midnight. */
function minutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/**
 * A group uses its room while it is active or still forming (a forming group
 * has the room booked for its start date) and is not archived.
 */
export function usesRoom(group: Pick<RoomGroup, "status" | "archived_at">): boolean {
  return group.archived_at === null && (group.status === "active" || group.status === "forming");
}

/**
 * Whether two weekly slots meet: they share a weekday and their times
 * overlap. A lesson that ends as the other starts does not overlap.
 */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  if (!a.days.some((day) => b.days.includes(day))) return false;
  const startA = minutes(a.start_time);
  const startB = minutes(b.start_time);
  return startA < startB + b.duration_min && startB < startA + a.duration_min;
}

/**
 * The group that already has the room at that time, or null when the room is
 * free. `exceptId` is the group being edited: it does not clash with itself.
 * When several clash, the first by name is returned, as the database does.
 */
export function findRoomClash(
  roomId: string,
  slot: Slot,
  groups: readonly RoomGroup[],
  exceptId?: string | null,
): RoomGroup | null {
  return (
    groups
      .filter((group) => group.room_id === roomId && group.id !== exceptId && usesRoom(group) && slotsOverlap(slot, group))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))[0] ?? null
  );
}
