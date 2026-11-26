"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { GroupErrorKey } from "@/lib/validation/groups";

type Save = (input: { lesson_id: string; is_exam: boolean; title: string }) => Promise<{ ok: true } | { ok: false; error: GroupErrorKey }>;

/**
 * Mark as exam, with a title — docs/STUDENT_APP_SPEC.md → "CRM changes →
 * Lesson sheet". Staff and the group's teacher use the same control; `save`
 * is the action of whoever is signed in. Switching it off saves at once;
 * switching it on asks for the title first.
 */
export function ExamControl({
  lessonId,
  isExam,
  title,
  save,
}: {
  lessonId: string;
  isExam: boolean;
  title: string | null;
  save: Save;
}) {
  const t = useTranslations("groups");
  const id = useId();
  const [on, setOn] = useState(isExam);
  const [text, setText] = useState(title ?? "");
  const [error, setError] = useState<GroupErrorKey | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = on !== isExam || (on && text.trim() !== (title ?? ""));

  function submit(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await save({ lesson_id: lessonId, is_exam: next, title: next ? text : "" });
      if (!result.ok) return setError(result.error);
      toast(t(next ? "lesson.examSaved" : "lesson.examCleared"));
    });
  }

  function toggle(next: boolean) {
    setOn(next);
    setError(null);
    // Back to an ordinary lesson needs nothing more.
    if (!next && isExam) submit(false);
  }

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-control border border-border px-3 py-3" data-slot="lesson-exam" data-exam={on}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-switch`} className="flex flex-col items-start gap-0.5">
          <span className="text-body text-text">{t("lesson.exam")}</span>
          <span className="text-footnote font-normal text-text-secondary">{t("lesson.examHint")}</span>
        </Label>
        <Switch id={`${id}-switch`} checked={on} onCheckedChange={toggle} disabled={pending} />
      </div>
      {on ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // Only this form: the sheet around it has its own Save.
            event.stopPropagation();
            submit(true);
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-title`}>{t("lesson.examTitle")}</Label>
            <Input
              id={`${id}-title`}
              value={text}
              maxLength={100}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending || !changed}>
            {t("lesson.examSave")}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-footnote text-danger">
          {t(`errors.${error}`)}
        </p>
      ) : null}
    </div>
  );
}
