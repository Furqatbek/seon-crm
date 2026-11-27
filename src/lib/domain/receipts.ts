// A payment receipt's file — docs/STUDENT_APP_SPEC.md → "Rules → Receipts":
// PNG, JPG or PDF up to 5 MB, with the type checked from the content. A file's
// name and the type a phone declares for it are not believed: only its first
// bytes say what it is.

export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_TYPES = ["png", "jpg", "pdf"] as const;
export type ReceiptFileType = (typeof RECEIPT_TYPES)[number];
export const RECEIPT_CONTENT_TYPES: Record<ReceiptFileType, string> = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" };

const startsWith = (bytes: Uint8Array, signature: readonly number[]) => bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

/** What a file is, from its first bytes; null when it is none of the three. */
export function sniffReceiptType(bytes: Uint8Array): ReceiptFileType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpg";
  // "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  return null;
}

export type ReceiptFileProblem = "fileEmpty" | "fileTooLarge" | "fileType";

/** The file's type, or why it is refused: empty, over 5 MB, or not a PNG, JPG or PDF. */
export function checkReceiptFile(bytes: Uint8Array): { ok: true; type: ReceiptFileType } | { ok: false; error: ReceiptFileProblem } {
  if (bytes.length === 0) return { ok: false, error: "fileEmpty" };
  if (bytes.length > RECEIPT_MAX_BYTES) return { ok: false, error: "fileTooLarge" };
  const type = sniffReceiptType(bytes);
  return type ? { ok: true, type } : { ok: false, error: "fileType" };
}

/** A receipt's file in the bucket: "<student id>/<name>", a name the app made. */
export const RECEIPT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
