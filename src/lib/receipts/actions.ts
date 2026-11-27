"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { paymentInstant } from "@/lib/domain/payments";
import { studentAppTexts } from "@/lib/notify/bot-texts";
import { runReceiptDecisions } from "@/lib/notify/receipt-notify";
import { appNotifyStore, getPushSender, receiptDecisionData } from "@/lib/notify/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { paymentSchema, type FinanceErrorKey, type FinanceResult } from "@/lib/validation/finance";
import { paymentSettingsSchema, rejectReceiptSchema, type PaymentSettingsErrorKey, type PaymentSettingsResult, type ReceiptErrorKey, type ReceiptResult } from "@/lib/validation/receipts";

import { getPendingReceipts, type PendingReceipts } from "./queries";

// Receipts in the CRM. Everything is written as the signed-in user: the
// database decides who may review, and that a receipt is reviewed once.

async function session(...roles: Array<"owner" | "manager">) {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  const allowed = roles.length > 0 ? roles : (["owner", "manager"] as const);
  return user && supabase && (allowed as readonly string[]).includes(user.role) ? { user, supabase } : null;
}

/** Settings → Payments. The owner's. */
export async function savePaymentSettings(input: unknown): Promise<PaymentSettingsResult> {
  const parsed = paymentSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as PaymentSettingsErrorKey) ?? "generic" };
  const ctx = await session("owner");
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { card_number, card_holder, bank, instructions } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("centre_settings")
    .update({
      // Without a number there is no card: the app's Pay by card is off.
      payment_card: card_number ? { number: card_number, holder: card_holder, bank } : null,
      payment_instructions: Object.fromEntries(Object.entries(instructions).filter(([, text]) => text !== "")),
    })
    .eq("singleton", true)
    .select("id");
  if (error) return { ok: false, error: error.code === "42501" ? "notAllowed" : "generic" };
  if (data.length === 0) return { ok: false, error: "notAllowed" };
  refresh();
  return { ok: true };
}

/** The student's push, after the answer has gone to the screen. */
function tellStudent() {
  after(async () => {
    const admin = createAdminClient();
    if (!admin) return;
    try {
      await runReceiptDecisions(new Date(), { store: appNotifyStore(admin), push: getPushSender(), data: receiptDecisionData(admin), texts: studentAppTexts });
    } catch (error) {
      // The decision is saved either way; the job that runs every 15 minutes tries again.
      console.error("receipt decision push", error);
    }
  });
}

const FINANCE_CODES: Record<string, FinanceErrorKey> = { "42501": "notAllowed", P0002: "notFound", ER002: "groupRequired", ER003: "amountInvalid", ER004: "dateInFuture", ER006: "receiptReviewed" };

/**
 * Approve from Take payment: the form's group, amount, date and note become
 * the one payment (by transfer) that is linked to the receipt.
 */
export async function approveReceipt(input: unknown): Promise<FinanceResult<{ id: string; receiptNo: number }>> {
  const receiptId = z.object({ receipt_id: z.uuid() }).safeParse(input);
  const parsed = paymentSchema.safeParse(input);
  if (!receiptId.success) return { ok: false, error: "notFound" };
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as FinanceErrorKey) ?? "generic" };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const paidAt = paymentInstant(parsed.data.paid_on, new Date());
  if (!paidAt) return { ok: false, error: "dateInFuture" };

  const { data: paymentId, error } = await ctx.supabase.rpc("review_receipt", {
    p_id: receiptId.data.receipt_id,
    p_action: "approve",
    p_group_id: parsed.data.group_id,
    p_amount: parsed.data.amount,
    p_paid_at: paidAt,
    p_note: parsed.data.note ?? undefined,
  });
  if (error || !paymentId) return { ok: false, error: (error?.code && FINANCE_CODES[error.code]) || "generic" };
  const payment = await ctx.supabase.from("payments").select("receipt_no").eq("id", paymentId).single();
  tellStudent();
  refresh();
  return { ok: true, data: { id: paymentId, receiptNo: payment.data?.receipt_no ?? 0 } };
}

const RECEIPT_CODES: Record<string, ReceiptErrorKey> = { "42501": "notAllowed", P0002: "notFound", ER006: "alreadyReviewed", ER007: "reasonRequired" };

/** Reject, with the reason the student is shown. */
export async function rejectReceipt(input: unknown): Promise<ReceiptResult> {
  const parsed = rejectReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: (parsed.error.issues[0]?.message as ReceiptErrorKey) ?? "generic" };
  const ctx = await session();
  if (!ctx) return { ok: false, error: "notAllowed" };
  const { error } = await ctx.supabase.rpc("review_receipt", { p_id: parsed.data.receipt_id, p_action: "reject", p_reason: parsed.data.reason });
  if (error) return { ok: false, error: (error.code && RECEIPT_CODES[error.code]) || "generic" };
  tellStudent();
  refresh();
  return { ok: true };
}

/** The receipts waiting for review, for the live count. */
export async function fetchPendingReceipts(): Promise<PendingReceipts> {
  return getPendingReceipts();
}
