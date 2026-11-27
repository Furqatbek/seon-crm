import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReceiptStatus } from "@/lib/validation/receipts";

// Receipts and the card they are paid to, read as the signed-in user: Row
// Level Security decides (the owner and managers see every receipt).

async function db() {
  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}
/** The table or the function is not there yet: a deploy is ahead of its migration. */
const missing = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "PGRST202";

type Language = "uz" | "ru" | "en" | "ko";
export type PaymentSettings = { card_number: string; card_holder: string; bank: string; instructions: Record<Language, string> };

/** Settings → Payments: the card and the instructions, empty where nothing is set. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const supabase = await db();
  const { data, error } = await supabase.from("centre_settings").select("payment_card, payment_instructions").single();
  if (error) throw new Error(error.message);
  const object = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const card = object(data.payment_card);
  const instructions = object(data.payment_instructions);
  return {
    card_number: text(card.number),
    card_holder: text(card.holder),
    bank: text(card.bank),
    instructions: { uz: text(instructions.uz), ru: text(instructions.ru), en: text(instructions.en), ko: text(instructions.ko) },
  };
}

export type ReceiptRow = {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  amount: number;
  paidOn: string;
  fileType: "png" | "jpg" | "pdf";
  /** A link to the file that works for an hour; null when it could not be signed. */
  fileUrl: string | null;
  comment: string | null;
  status: ReceiptStatus;
  rejectReason: string | null;
  /** The payment an approved receipt made, and its number. */
  paymentId: string | null;
  receiptNo: number | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** Another receipt has the same file. */
  sameFile: boolean;
  /** The same student sent the same amount for the same day. */
  sameAmountDate: boolean;
};

/** Receipts of one status for Finance → Receipts: pending ones the oldest first, decided ones the latest first. */
export async function getReceipts(status: ReceiptStatus): Promise<ReceiptRow[]> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("receipts_for_review", { p_status: status, p_limit: status === "pending" ? 200 : 50 });
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  // The files are private: links that work for an hour, for whoever may read them.
  const links = new Map<string, string>();
  if (data.length > 0) {
    const signed = await supabase.storage.from("receipts").createSignedUrls(data.map((row) => row.file_path), 3600);
    for (const item of signed.data ?? []) if (item.path && item.signedUrl) links.set(item.path, item.signedUrl);
  }
  return data.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    groupId: row.group_id,
    groupName: row.group_name,
    amount: row.amount,
    paidOn: row.paid_on,
    fileType: row.file_type as ReceiptRow["fileType"],
    fileUrl: links.get(row.file_path) ?? null,
    comment: row.comment,
    status: row.status,
    rejectReason: row.reject_reason,
    paymentId: row.payment_id,
    receiptNo: row.receipt_no,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by_name,
    sameFile: row.same_file,
    sameAmountDate: row.same_amount_date,
  }));
}

export type PendingReceipts = { count: number; latest: Array<{ id: string; studentName: string }> };

/** How many receipts wait for review, with the newest few by name: the sidebar's count and the toast. Empty for a teacher. */
export async function getPendingReceipts(): Promise<PendingReceipts> {
  const supabase = await createClient();
  if (!supabase) return { count: 0, latest: [] };
  const { data, count, error } = await supabase.from("payment_receipts").select("id, student_id", { count: "exact" }).eq("status", "pending").order("created_at", { ascending: false }).limit(5);
  if (error || !data) return { count: 0, latest: [] };
  const students = data.length > 0 ? await supabase.from("students").select("id, full_name").in("id", [...new Set(data.map((row) => row.student_id))]) : null;
  const nameOf = new Map((students?.data ?? []).map((row) => [row.id, row.full_name]));
  return { count: count ?? data.length, latest: data.map((row) => ({ id: row.id, studentName: nameOf.get(row.student_id) ?? "" })) };
}
