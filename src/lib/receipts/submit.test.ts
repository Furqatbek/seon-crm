import { describe, expect, it } from "vitest";

import { RECEIPT_MAX_BYTES, checkReceiptFile, sniffReceiptType } from "../domain/receipts";
import { submitReceipt, type SubmitDeps, type SubmitInput } from "./submit";

// Receipts from the student app — docs/STUDENT_APP_SPEC.md → "Rules → Receipts".

const STUDENT = "00000004-0000-4000-8000-000000000001";
const OTHER = "00000004-0000-4000-8000-000000000002";
const bytes = (head: number[], length = 2048) => {
  const file = new Uint8Array(length);
  file.set(head);
  return file;
};
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
// "MZ": a Windows program.
const EXE = [0x4d, 0x5a, 0x90, 0x00];

describe("a receipt's file", () => {
  it("is known by its first bytes, whatever it is called", () => {
    expect(sniffReceiptType(bytes(PNG))).toBe("png");
    expect(sniffReceiptType(bytes(JPG))).toBe("jpg");
    expect(sniffReceiptType(bytes(PDF))).toBe("pdf");
    expect(sniffReceiptType(bytes(EXE))).toBeNull();
    // A web page, a zip, a GIF, and nothing at all.
    expect(sniffReceiptType(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(sniffReceiptType(bytes([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(sniffReceiptType(bytes([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(sniffReceiptType(new Uint8Array(0))).toBeNull();
    // Only the start counts: "%PDF-" further in is not a PDF.
    expect(sniffReceiptType(bytes([0x00, ...PDF]))).toBeNull();
  });

  it("is refused when empty, over 5 MB, or none of PNG, JPG and PDF", () => {
    expect(checkReceiptFile(new Uint8Array(0))).toEqual({ ok: false, error: "fileEmpty" });
    expect(checkReceiptFile(bytes(EXE))).toEqual({ ok: false, error: "fileType" });
    expect(checkReceiptFile(bytes(JPG, RECEIPT_MAX_BYTES))).toEqual({ ok: true, type: "jpg" });
    expect(checkReceiptFile(bytes(JPG, RECEIPT_MAX_BYTES + 1))).toEqual({ ok: false, error: "fileTooLarge" });
    expect(checkReceiptFile(bytes(JPG, 6 * 1024 * 1024))).toEqual({ ok: false, error: "fileTooLarge" });
  });
});

function fakes(files: Record<string, Uint8Array>, options: { student?: string | null; code?: string } = {}) {
  const removed: string[] = [];
  const saved: Array<Record<string, unknown>> = [];
  const deps: SubmitDeps = {
    studentOf: async () => (options.student === undefined ? STUDENT : options.student),
    download: async (path) => files[path] ?? null,
    remove: async (path) => void removed.push(path),
    sha256: async (file) => `hash-of-${file.length}`,
    save: async (receipt) => {
      if (options.code) return { code: options.code };
      saved.push(receipt);
      return { id: "receipt-1" };
    },
  };
  return { deps, removed, saved };
}
const input = (path: string, overrides: Partial<SubmitInput> = {}): SubmitInput => ({ profileId: "profile-1", path, groupId: null, amount: 600_000, paidOn: "2026-11-24", comment: null, ...overrides });

describe("submitting a receipt", () => {
  it("a program renamed to .jpg is refused, removed from the bucket, and nothing is saved", async () => {
    const path = `${STUDENT}/chek_dekabr.jpg`;
    const { deps, removed, saved } = fakes({ [path]: bytes(EXE) });
    expect(await submitReceipt(deps, input(path))).toEqual({ ok: false, error: "fileType" });
    expect(removed).toEqual([path]);
    expect(saved).toEqual([]);
  });

  it("a 6 MB file is refused and removed", async () => {
    const path = `${STUDENT}/big.jpg`;
    const { deps, removed, saved } = fakes({ [path]: bytes(JPG, 6 * 1024 * 1024) });
    expect(await submitReceipt(deps, input(path))).toEqual({ ok: false, error: "fileTooLarge" });
    expect(removed).toEqual([path]);
    expect(saved).toEqual([]);
  });

  it("a real picture or PDF is saved with the type its content has, not the one its name claims, and the server's hash", async () => {
    // A PDF that was named .jpg by mistake.
    const path = `${STUDENT}/receipt.jpg`;
    const { deps, removed, saved } = fakes({ [path]: bytes(PDF, 4000) });
    expect(await submitReceipt(deps, input(path, { groupId: "group-1", comment: "Dekabr" }))).toEqual({ ok: true, id: "receipt-1" });
    expect(saved).toEqual([{ profileId: "profile-1", path, groupId: "group-1", amount: 600_000, paidOn: "2026-11-24", comment: "Dekabr", type: "pdf", hash: "hash-of-4000" }]);
    expect(removed).toEqual([]);
  });

  it("only a file in the student's own folder, that is really there", async () => {
    const theirs = `${OTHER}/a.jpg`;
    const { deps, removed, saved } = fakes({ [theirs]: bytes(JPG) });
    expect(await submitReceipt(deps, input(theirs))).toEqual({ ok: false, error: "file" });
    expect(await submitReceipt(deps, input(`${STUDENT}/missing.jpg`))).toEqual({ ok: false, error: "file" });
    expect(await submitReceipt(deps, input(`${STUDENT}/../${OTHER}/a.jpg`))).toEqual({ ok: false, error: "file" });
    expect(await submitReceipt(deps, input("a.jpg"))).toEqual({ ok: false, error: "file" });
    // Somebody else's file is never touched.
    expect(removed).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("an App user has no receipts", async () => {
    const { deps } = fakes({}, { student: null });
    expect(await submitReceipt(deps, input(`${STUDENT}/a.jpg`))).toEqual({ ok: false, error: "notStudent" });
  });

  it("what the database refuses is told by its reason, and the file does not stay", async () => {
    const path = `${STUDENT}/a.png`;
    for (const [code, error] of [["ER002", "group"], ["ER003", "amount"], ["ER004", "date"], ["ER005", "file"], ["XX000", "generic"]] as const) {
      const { deps, removed } = fakes({ [path]: bytes(PNG) }, { code });
      expect(await submitReceipt(deps, input(path))).toEqual({ ok: false, error });
      expect(removed).toEqual([path]);
    }
  });
});
