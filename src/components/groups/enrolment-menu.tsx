"use client";

import { ArrowRightLeft, Coins, Ellipsis, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Coins, Transfer and Leave group for one enrolment. */
export function EnrolmentMenu({
  label,
  onCoins,
  onTransfer,
  onLeave,
}: {
  /** Says whose menu this is, for screen readers. */
  label: string;
  /** Only where the row is a student in a group's list. */
  onCoins?: () => void;
  onTransfer: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("groups.studentsTab");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("rowActions", { name: label })}
          onClick={(event) => event.stopPropagation()}
        >
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {onCoins ? (
          <DropdownMenuItem onSelect={onCoins}>
            <Coins aria-hidden />
            {t("coins")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onTransfer}>
          <ArrowRightLeft aria-hidden />
          {t("transfer")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLeave}>
          <LogOut aria-hidden />
          {t("leave")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
