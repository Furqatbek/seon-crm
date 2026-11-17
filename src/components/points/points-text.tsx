import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/** "12 points", or "+2 points" / "−3 points" when signed. Never a float. */
export function PointsText({ value, signed = false, className }: { value: number; signed?: boolean; className?: string }) {
  const t = useTranslations("points");
  const sign = signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : "";
  return (
    <span
      data-slot="points-text"
      data-value={value}
      className={cn("whitespace-nowrap numeric", signed && value < 0 && "text-danger", signed && value > 0 && "text-success", className)}
    >
      {sign}
      {t("count", { count: Math.abs(signed ? value : Math.max(value, 0)) })}
    </span>
  );
}
