"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QuestionRow } from "@/lib/questions/queries";
import { cn } from "@/lib/utils";

import { bankLabel } from "./bank-label";

/** The question as a player sees it, with the right answer marked and the explanation they get afterwards. */
export function QuestionPreview({ question, onClose }: { question: QuestionRow | null; onClose: () => void }) {
  const t = useTranslations("questions");
  return (
    <Dialog open={question !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {question ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("preview.title")}</DialogTitle>
              <DialogDescription>{bankLabel(question.subject, question.level)}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4" data-slot="question-preview">
              {question.imageUrl ? (
                // A short-lived signed link to a private file: not something to optimise or cache.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={question.imageUrl} alt="" className="max-h-56 w-full rounded-control object-contain" />
              ) : null}
              <p className="text-headline text-text">{question.text}</p>
              <ul className="flex flex-col gap-2">
                {question.options.map((option) => {
                  const right = option.id === question.correct_option_id;
                  return (
                    <li
                      key={option.id}
                      data-right={right || undefined}
                      className={cn("flex items-center justify-between gap-3 rounded-control border px-3 py-2 text-body", right ? "border-success bg-success-tint text-text" : "border-border text-text")}
                    >
                      <span>{option.text}</span>
                      {right ? (
                        <span className="flex shrink-0 items-center gap-1 text-footnote text-success">
                          <Check aria-hidden className="size-4" />
                          {t("preview.right")}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {question.explanation ? (
                <p className="rounded-control bg-bg-subtle px-3 py-2 text-footnote text-text-secondary">
                  <span className="font-medium text-text">{t("preview.explanation")}: </span>
                  {question.explanation}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
