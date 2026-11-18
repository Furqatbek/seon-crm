"use client";

import { Gift } from "lucide-react";
import { useTranslations } from "next-intl";

import { StatusPill } from "@/components/ui/status-pill";
import type { Reward } from "@/lib/points/queries";
import { cn } from "@/lib/utils";

import { PointsText } from "./points-text";

/** One reward: photo, name, cost and stock. `action` is the button under it. */
export function RewardCard({ reward, action, className }: { reward: Reward; action?: React.ReactNode; className?: string }) {
  const t = useTranslations("points.rewards");
  return (
    <article
      data-reward={reward.name}
      data-stock={reward.stock ?? "unlimited"}
      className={cn("flex flex-col overflow-hidden rounded-card border border-border bg-bg", className)}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-bg-subtle">
        {reward.photoUrl ? (
          // A signed link to a private bucket: the image optimiser cannot fetch it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={reward.photoUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <Gift className="size-10 text-text-tertiary" aria-hidden />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline text-text">{reward.name}</h3>
          {reward.is_active ? null : <StatusPill>{t("off")}</StatusPill>}
        </div>
        {reward.description ? <p className="text-footnote text-text-secondary">{reward.description}</p> : null}
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-2 pt-1">
          <PointsText value={reward.cost} className="font-medium text-text" />
          <span className={cn("text-footnote", reward.stock === 0 ? "text-danger" : "text-text-secondary")} data-cell="stock">
            {reward.stock === null ? t("unlimited") : reward.stock === 0 ? t("outOfStock") : t("left", { count: reward.stock })}
          </span>
        </div>
        {action}
      </div>
    </article>
  );
}
