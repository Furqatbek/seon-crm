import { useLocale } from "next-intl";

import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The only way money reaches the screen. Never calculates: it formats the
 * whole-soʻm amount it is given with tabular numbers.
 */
function MoneyText({
  amount,
  debt = false,
  className,
}: {
  amount: bigint | number;
  /** Colour a negative amount red, for balances. The minus sign already says it. */
  debt?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const negative = BigInt(amount) < BigInt(0);
  return (
    <span
      data-slot="money-text"
      className={cn("whitespace-nowrap numeric", debt && negative && "text-danger", className)}
    >
      {formatMoney(amount, locale)}
    </span>
  );
}

export { MoneyText };
