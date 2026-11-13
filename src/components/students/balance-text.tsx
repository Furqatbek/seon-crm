import { useTranslations } from "next-intl";

import { MoneyText } from "@/components/ui/money-text";
import { StatusPill } from "@/components/ui/status-pill";
import type { BalanceState } from "@/lib/domain/ledger";
import { cn } from "@/lib/utils";

import { BALANCE_TONE } from "./student-meta";

/**
 * A balance with its meaning in words: red with a Debt pill when in debt,
 * a Due pill while this month's fee is still within its due day.
 */
export function BalanceText({
  balance,
  state,
  className,
  pill = true,
}: {
  balance: number;
  state: BalanceState;
  className?: string;
  pill?: boolean;
}) {
  const t = useTranslations("students.balance");
  const showPill = pill && state !== "settled";
  return (
    <span className={cn("inline-flex items-center justify-end gap-2", className)} data-balance-state={state}>
      {showPill ? <StatusPill tone={BALANCE_TONE[state]}>{t(state)}</StatusPill> : null}
      <MoneyText
        amount={balance}
        className={cn(state === "debt" && "text-danger", state === "due" && "text-warning")}
      />
    </span>
  );
}
