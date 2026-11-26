"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { requestReward } from "@/lib/points/actions";
import type { Reward } from "@/lib/points/queries";
import { rewardStockLeft, variantLabel } from "@/lib/points/variants";
import type { PointsErrorKey } from "@/lib/validation/points";

import { RewardCard } from "./reward-card";

/**
 * A desk request: the catalogue with what the student can afford. Choosing a
 * reward holds its points at once; it then waits in Requests to be handed over.
 */
export function RedeemSheet({
  open,
  student,
  balance,
  rewards,
  onClose,
}: {
  open: boolean;
  student: { id: string; name: string };
  balance: number;
  rewards: Reward[];
  onClose: () => void;
}) {
  const t = useTranslations("points");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<PointsErrorKey | null>(null);

  function redeem(reward: Reward, variantId: string | null = null) {
    setError(null);
    startTransition(async () => {
      const result = await requestReward({ student_id: student.id, reward_id: reward.id, variant_id: variantId });
      if (!result.ok) return setError(result.error);
      toast(t("redeem.done", { reward: reward.name }));
      onClose();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setError(null);
        onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("redeem.title", { name: student.name })}</SheetTitle>
          <SheetDescription>{t("redeem.hint", { count: balance })}</SheetDescription>
        </SheetHeader>
        <SheetBody className="pb-6">
          {error ? (
            <p role="alert" className="text-footnote text-danger">
              {t(`errors.${error}`)}
            </p>
          ) : null}
          {rewards.length === 0 ? (
            <p className="py-6 text-center text-body text-text-secondary">{t("rewards.empty")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {rewards.map((reward) => {
                const short = reward.cost - balance;
                const gone = rewardStockLeft(reward) === 0;
                return (
                  <RewardCard
                    key={reward.id}
                    reward={reward}
                    action={
                      short > 0 || gone ? (
                        <p className="mt-1 text-footnote text-text-secondary">
                          {gone ? t("rewards.outOfStock") : t("redeem.short", { count: short })}
                        </p>
                      ) : reward.variants.length > 0 ? (
                        // One button per variant that is in stock.
                        <div role="group" aria-label={t("rewards.chooseVariant")} className="mt-1 flex flex-col gap-1.5">
                          <p className="text-footnote text-text-secondary">{t("rewards.chooseVariant")}</p>
                          <div className="flex flex-wrap gap-2">
                            {reward.variants.map((variant) => (
                              <Button key={variant.id} variant="primary" disabled={pending || variant.stock === 0} onClick={() => redeem(reward, variant.id)}>
                                {variantLabel(variant.name, locale)}
                                <span className="sr-only">: {reward.name}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <Button variant="primary" disabled={pending} onClick={() => redeem(reward)} className="mt-1">
                          {t("redeem.action")}
                          <span className="sr-only">: {reward.name}</span>
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
