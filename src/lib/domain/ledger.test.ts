import { describe, expect, it } from "vitest";

import { balanceState, buildLedger, ledgerBalance } from "./ledger";

const charge = (id: string, created_at: string, amount: number) => ({ id, created_at, amount });
const payment = (id: string, paid_at: string, amount: number, voided_at: string | null = null) => ({
  id,
  paid_at,
  amount,
  voided_at,
});

describe("buildLedger", () => {
  it("is empty for a student with no history", () => {
    expect(buildLedger([], [])).toEqual([]);
    expect(ledgerBalance([], [])).toBe(0);
  });

  it("runs the balance through charges and payments, oldest first", () => {
    const ledger = buildLedger(
      [
        charge("c2", "2026-10-31T19:10:00Z", 600_000), // November fee
        charge("c1", "2026-09-30T19:10:00Z", 600_000), // October fee
      ],
      [
        payment("p1", "2026-10-03T05:00:00Z", 600_000),
        payment("p2", "2026-11-04T05:00:00Z", 250_000),
      ],
    );

    expect(ledger.map((entry) => [entry.key, entry.balance])).toEqual([
      ["charge-c1", -600_000],
      ["payment-p1", 0],
      ["charge-c2", -600_000],
      ["payment-p2", -350_000],
    ]);
    expect(ledgerBalance(
      [charge("c1", "2026-09-30T19:10:00Z", 600_000), charge("c2", "2026-10-31T19:10:00Z", 600_000)],
      [payment("p1", "2026-10-03T05:00:00Z", 600_000), payment("p2", "2026-11-04T05:00:00Z", 250_000)],
    )).toBe(-350_000);
  });

  it("a voided payment stays in the list but does not move the balance", () => {
    const ledger = buildLedger(
      [charge("c1", "2026-11-01T00:00:00Z", 500_000)],
      [
        payment("p1", "2026-11-02T00:00:00Z", 500_000, "2026-11-03T00:00:00Z"),
        payment("p2", "2026-11-04T00:00:00Z", 500_000),
      ],
    );
    expect(ledger.map((entry) => entry.balance)).toEqual([-500_000, -500_000, 0]);
    expect(ledger[1]).toMatchObject({ kind: "payment", voided: true });
    expect(ledger[2]).toMatchObject({ kind: "payment", voided: false });
  });

  it("a credit is a negative charge and raises the balance", () => {
    const ledger = buildLedger(
      [charge("c1", "2026-11-01T00:00:00Z", 500_000), charge("c2", "2026-11-10T00:00:00Z", -150_000)],
      [],
    );
    expect(ledger.map((entry) => entry.balance)).toEqual([-500_000, -350_000]);
  });

  it("paying ahead leaves credit that covers the next charge", () => {
    const ledger = buildLedger(
      [charge("c1", "2026-11-01T00:00:00Z", 400_000), charge("c2", "2026-12-01T00:00:00Z", 400_000)],
      [payment("p1", "2026-11-02T00:00:00Z", 1_000_000)],
    );
    expect(ledger.map((entry) => entry.balance)).toEqual([-400_000, 600_000, 200_000]);
  });

  it("at the same instant the charge comes before the payment", () => {
    const at = "2026-11-13T07:00:00Z";
    const ledger = buildLedger([charge("c1", at, 350_000)], [payment("p1", at, 350_000)]);
    expect(ledger.map((entry) => [entry.kind, entry.balance])).toEqual([
      ["charge", -350_000],
      ["payment", 0],
    ]);
  });

  it("orders by instant whatever the time zone it is written in", () => {
    const ledger = buildLedger(
      [charge("c1", "2026-11-01T00:10:00+05:00", 100_000)],
      [payment("p1", "2026-10-31T19:05:00Z", 100_000)], // five minutes earlier
    );
    expect(ledger.map((entry) => entry.kind)).toEqual(["payment", "charge"]);
    expect(ledger.at(-1)?.balance).toBe(0);
  });

  it("does not change its inputs and keeps the rows it was given", () => {
    const charges = [charge("c2", "2026-11-02T00:00:00Z", 1), charge("c1", "2026-11-01T00:00:00Z", 1)];
    const ledger = buildLedger(charges, []);
    expect(charges.map((row) => row.id)).toEqual(["c2", "c1"]);
    expect(ledger[0]).toMatchObject({ kind: "charge", charge: charges[1] });
  });

  it("refuses amounts that are not whole soʻm", () => {
    expect(() => buildLedger([charge("c1", "2026-11-01T00:00:00Z", 1000.5)], [])).toThrow(RangeError);
    expect(() => buildLedger([], [payment("p1", "2026-11-01T00:00:00Z", Number.NaN)])).toThrow(RangeError);
  });
});

describe("balanceState", () => {
  const on = (today: string, oldestUnpaidMonth?: string | null) => ({ today, dueDay: 5, oldestUnpaidMonth });

  it("zero is settled and above zero is credit", () => {
    expect(balanceState(0, on("2026-11-13"))).toBe("settled");
    expect(balanceState(200_000, on("2026-11-13"))).toBe("credit");
  });

  it("an unpaid fee is due until the due day and debt after it", () => {
    expect(balanceState(-500_000, on("2026-11-01", "2026-11-01"))).toBe("due");
    expect(balanceState(-500_000, on("2026-11-05", "2026-11-01"))).toBe("due");
    expect(balanceState(-500_000, on("2026-11-06", "2026-11-01"))).toBe("debt");
    expect(balanceState(-500_000, on("2026-11-30", "2026-11-01"))).toBe("debt");
  });

  it("a fee from an earlier month is debt even before this month's due day", () => {
    expect(balanceState(-500_000, on("2026-11-03", "2026-10-01"))).toBe("debt");
    expect(balanceState(-500_000, on("2027-01-02", "2026-12-01"))).toBe("debt");
  });

  it("follows the centre's due day", () => {
    expect(balanceState(-1, { today: "2026-11-10", dueDay: 10 })).toBe("due");
    expect(balanceState(-1, { today: "2026-11-11", dueDay: 10 })).toBe("debt");
  });
});
