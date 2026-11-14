"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/format";
import { getMessageDraft, sendMessage, type MessageDraft } from "@/lib/notify/actions";
import type { NotifyFailure } from "@/lib/validation/notify";

type Channel = "telegram" | "sms";

function MessageForm({ studentId, draft, onClose }: { studentId: string; draft: MessageDraft; onClose: () => void }) {
  const t = useTranslations("notify");
  const tCommon = useTranslations("common");
  const [channel, setChannel] = useState<Channel>(draft.telegramLinked ? "telegram" : "sms");
  const [body, setBody] = useState(draft.drafts[draft.telegramLinked ? "telegram" : "sms"]);
  const [edited, setEdited] = useState(false);
  const [problem, setProblem] = useState<NotifyFailure | "failed" | null>(null);
  const [pending, startTransition] = useTransition();

  function changeChannel(next: Channel) {
    setChannel(next);
    // The starting text follows the channel until someone has typed their own.
    if (!edited) setBody(draft.drafts[next]);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setProblem(null);
    startTransition(async () => {
      const result = await sendMessage({ student_id: studentId, channel, body });
      if (!result.ok) return setProblem(result);
      if (!result.delivered) return setProblem("failed");
      toast(t("send.sent"));
      onClose();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <div className="flex flex-col gap-1.5">
          <SegmentedControl
            aria-label={t("send.channel")}
            value={channel}
            onValueChange={changeChannel}
            fullWidth
            options={[
              { value: "telegram", label: t("send.telegram"), disabled: !draft.telegramLinked },
              { value: "sms", label: t("send.sms"), disabled: !draft.smsTo },
            ]}
          />
          {!draft.telegramLinked ? <p className="text-footnote text-text-secondary">{t("send.notLinked")}</p> : null}
        </div>
        <Field label={t("send.text")} htmlFor="message-body">
          <Textarea
            id="message-body"
            rows={6}
            maxLength={1000}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setEdited(true);
            }}
          />
        </Field>
        {channel === "sms" && draft.smsTo ? (
          <p className="text-footnote text-text-secondary">{t("send.smsHint", { phone: formatPhone(draft.smsTo) })}</p>
        ) : null}
        {problem ? (
          <p role="alert" className="text-footnote text-danger">
            {problem === "failed"
              ? t("send.failed")
              : t(`errors.${problem.error}`, { from: problem.quiet?.from ?? "", to: problem.quiet?.to ?? "" })}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onClose}>
          {tCommon(problem === "failed" ? "close" : "cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending || body.trim() === ""}>
          {t("send.action")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** Send message: a one-off text to a student by Telegram or SMS. It is logged on the Messages tab. */
export function SendMessageSheet({
  open,
  student,
  onClose,
}: {
  open: boolean;
  student: { id: string; full_name: string };
  onClose: () => void;
}) {
  const t = useTranslations("notify");
  const [draft, setDraft] = useState<MessageDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void getMessageDraft(student.id).then((result) => {
      if (current) setDraft(result);
    });
    return () => {
      current = false;
      setDraft(null);
    };
  }, [open, student.id]);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("send.title", { student: student.full_name })}</SheetTitle>
        </SheetHeader>
        {open && draft ? <MessageForm studentId={student.id} draft={draft} onClose={onClose} /> : <SheetBody />}
      </SheetContent>
    </Sheet>
  );
}
