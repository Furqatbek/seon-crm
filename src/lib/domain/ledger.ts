// The student ledger — docs/SPEC.md → "Business rules → Payments and balance".
// Balance = non-voided payments minus all charges. Amounts are whole soʻm.

export type LedgerChargeInput = {
  id: string;
  /** When the charge was created (ISO instant). */
  created_at: string;
  /** Positive = a fee, negative = a credit. */
  amount: number;
};

export type LedgerPaymentInput = {
  id: string;
  /** When the money was received (ISO instant). */
  paid_at: string;
  amount: number;
  voided_at: string | null;
};

export type LedgerEntry<C extends LedgerChargeInput, P extends LedgerPaymentInput> = (
  | { kind: "charge"; charge: C }
  | { kind: "payment"; payment: P; voided: boolean }
) & {
  /** Stable key for lists. */
  key: string;
  /** The instant the entry is ordered by. */
  at: string;
  /** Balance after this entry: below zero is debt, above zero is credit. */
  balance: number;
};

function assertWholeSom(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`Ledger amounts are whole soʻm, got ${amount}`);
  }
}

/**
 * Merges charges and payments into one list, oldest first, with the running
 * balance after each row. A voided payment stays in the list (so the history
 * is honest) but does not move the balance. At the same instant a charge
 * comes before a payment.
 */
export function buildLedger<C extends LedgerChargeInput, P extends LedgerPaymentInput>(
  charges: readonly C[],
  payments: readonly P[],
): Array<LedgerEntry<C, P>> {
  type Row =
    | { kind: "charge"; at: string; key: string; charge: C }
    | { kind: "payment"; at: string; key: string; payment: P; voided: boolean };

  const rows: Row[] = [
    ...charges.map((charge): Row => {
      assertWholeSom(charge.amount);
      return { kind: "charge", at: charge.created_at, key: `charge-${charge.id}`, charge };
    }),
    ...payments.map((payment): Row => {
      assertWholeSom(payment.amount);
      return {
        kind: "payment",
        at: payment.paid_at,
        key: `payment-${payment.id}`,
        payment,
        voided: payment.voided_at !== null,
      };
    }),
  ];

  rows.sort((a, b) => {
    const time = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (time !== 0) return time;
    if (a.kind !== b.kind) return a.kind === "charge" ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  let balance = 0;
  return rows.map((row) => {
    if (row.kind === "charge") balance -= row.charge.amount;
    else if (!row.voided) balance += row.payment.amount;
    return { ...row, balance };
  });
}

/** The balance after every entry: what student_balances reports for the student. */
export function ledgerBalance(
  charges: readonly LedgerChargeInput[],
  payments: readonly LedgerPaymentInput[],
): number {
  return buildLedger(charges, payments).at(-1)?.balance ?? 0;
}

export type BalanceState = "debt" | "due" | "settled" | "credit";

/**
 * How a balance reads on a given day.
 *   debt    — below zero after the due day of the current month, or when a fee
 *             from an earlier month is still unpaid
 *   due     — below zero, but this month's due day has not passed yet
 *   settled — exactly zero
 *   credit  — above zero: it covers the next charges
 */
export function balanceState(
  balance: number,
  options: {
    /** "YYYY-MM-DD" in Tashkent. */
    today: string;
    /** Day of the month fees are due by (centre_settings.due_day). */
    dueDay: number;
    /** student_balances.oldest_unpaid_month, "YYYY-MM-01" or null. */
    oldestUnpaidMonth?: string | null;
  },
): BalanceState {
  if (balance > 0) return "credit";
  if (balance === 0) return "settled";
  const monthStart = `${options.today.slice(0, 7)}-01`;
  const overdueFromEarlier =
    options.oldestUnpaidMonth != null && options.oldestUnpaidMonth < monthStart;
  const day = Number(options.today.slice(8, 10));
  return overdueFromEarlier || day > options.dueDay ? "debt" : "due";
}
