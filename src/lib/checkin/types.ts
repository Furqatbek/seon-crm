// The reception scanner — docs/STUDENT_APP_SPEC.md → "Rules → QR check-in".
// What the screen is told about a scan. No money amounts and no phone numbers:
// a kiosk sees a name, a photo, today's lessons and whether there is a debt.

export type CheckinLesson = { group: string; start_time: string; end_time: string; room: string | null; exam: boolean };

export type CheckinVisit = {
  ok: true;
  kind: "arrived" | "left";
  /** The same visit shown again: scanned twice within 2 minutes. */
  repeat: boolean;
  /** "14:52", Tashkent time. */
  time: string;
  student: { id: string; name: string; photoUrl: string | null };
  lessons: CheckinLesson[];
  debt: boolean;
};

/**
 * Why a scan was refused, in the screen's words:
 * invalid = not this centre's code; expired = an old code; clock = the phone's
 * clock is wrong; unknown = no such student; notAllowed = this login may not
 * check in; offline = the server was not reached.
 */
export type CheckinError = "invalid" | "expired" | "clock" | "unknown" | "notAllowed" | "offline";

export type CheckinResult = CheckinVisit | { ok: false; error: CheckinError };

export type CheckinMatch = { id: string; name: string; groups: string | null };

/** What a scanner or a camera read is one of our codes, by its shape. */
export const looksLikeCode = (text: string) => /^v1\.[0-9a-f-]{36}\.\d{1,12}\.[0-9a-f]{64}$/i.test(text.trim());
