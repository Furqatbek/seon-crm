import { RECEIPT_PATH, checkReceiptFile, type ReceiptFileType } from "../domain/receipts.ts";

// Taking a receipt from the student app. The app has put the file in the
// private bucket, in the student's own folder; this reads it back, checks
// what it really is, and only then lets the database write the receipt. A
// file that is refused is removed from the bucket.

export type SubmitInput = {
  /** The signed-in account, from its access token. */
  profileId: string;
  path: string;
  groupId: string | null;
  amount: number;
  /** "YYYY-MM-DD" */
  paidOn: string;
  comment: string | null;
};

export type SubmitError = "notStudent" | "file" | "fileEmpty" | "fileTooLarge" | "fileType" | "group" | "amount" | "date" | "generic";

export interface SubmitDeps {
  /** The student the account is linked to, or null. */
  studentOf(profileId: string): Promise<string | null>;
  /** The file's bytes, or null when there is no such file. */
  download(path: string): Promise<Uint8Array | null>;
  remove(path: string): Promise<void>;
  sha256(bytes: Uint8Array): Promise<string>;
  /** submit_receipt(): the new receipt's id, or the database's error code. */
  save(receipt: SubmitInput & { type: ReceiptFileType; hash: string }): Promise<{ id: string } | { code: string | undefined }>;
}

export type SubmitResult = { ok: true; id: string } | { ok: false; error: SubmitError };

const CODES: Record<string, SubmitError> = { ER001: "notStudent", ER002: "group", ER003: "amount", ER004: "date", ER005: "file" };

export async function submitReceipt(deps: SubmitDeps, input: SubmitInput): Promise<SubmitResult> {
  const studentId = await deps.studentOf(input.profileId);
  if (!studentId) return { ok: false, error: "notStudent" };
  // Only a file in the student's own folder: nobody submits somebody else's.
  if (!RECEIPT_PATH.test(input.path) || !input.path.startsWith(`${studentId}/`)) return { ok: false, error: "file" };
  const bytes = await deps.download(input.path);
  if (!bytes) return { ok: false, error: "file" };

  const checked = checkReceiptFile(bytes);
  if (!checked.ok) {
    await deps.remove(input.path);
    return { ok: false, error: checked.error };
  }
  const saved = await deps.save({ ...input, type: checked.type, hash: await deps.sha256(bytes) });
  if ("id" in saved) return { ok: true, id: saved.id };
  await deps.remove(input.path);
  return { ok: false, error: (saved.code && CODES[saved.code]) || "generic" };
}
