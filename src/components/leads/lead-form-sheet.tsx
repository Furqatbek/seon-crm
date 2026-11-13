"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { PhoneMatches, usePhoneMatches } from "@/components/shared/phone-matches";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_SOURCES, tashkentDate } from "@/lib/domain/leads";
import { formatPhone } from "@/lib/format";
import { createLead, updateLead } from "@/lib/leads/actions";
import type { LeadDetail, StaffOption } from "@/lib/leads/queries";
import {
  leadFormSchema,
  type LeadErrorKey,
  type LeadFormInput,
  type LeadFormValues,
} from "@/lib/validation/leads";

const UNASSIGNED = "none";

function LeadForm({
  lead,
  staff,
  defaultAssignee,
  onDone,
}: {
  lead: LeadDetail | null;
  staff: StaffOption[];
  defaultAssignee: string;
  onDone: () => void;
}) {
  const t = useTranslations("leads");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<LeadErrorKey | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: lead
      ? {
          full_name: lead.full_name,
          phone: formatPhone(lead.phone),
          source: lead.source,
          subject_interest: lead.subject_interest ?? "",
          preferred_time: lead.preferred_time ?? "",
          assigned_to: lead.assigned_to ?? "",
          next_contact: lead.next_contact_at ? tashkentDate(lead.next_contact_at) : "",
          notes: lead.notes ?? "",
        }
      : {
          full_name: "",
          phone: "+998 ",
          subject_interest: "",
          preferred_time: "",
          assigned_to: defaultAssignee,
          next_contact: "",
          notes: "",
        },
  });

  // Warn when the number already belongs to a lead or a student. It does not block saving.
  const phone = useWatch({ control, name: "phone" });
  const matches = usePhoneMatches(phone, { leadId: lead?.id });

  const message = (key: string | undefined) => (key ? t(`errors.${key as LeadErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // The server parses the same raw form again, so send display values.
      const raw = {
        ...values,
        assigned_to: values.assigned_to ?? "",
        next_contact: values.next_contact ?? "",
        subject_interest: values.subject_interest ?? "",
        preferred_time: values.preferred_time ?? "",
        notes: values.notes ?? "",
      };
      const result = lead ? await updateLead(lead.id, raw) : await createLead(raw);
      if (result.ok) {
        toast(t(lead ? "form.saved" : "form.created"));
        onDone();
      } else {
        setFormError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field label={t("fields.name")} htmlFor="lead-name" error={message(errors.full_name?.message)}>
          <Input
            id="lead-name"
            autoComplete="off"
            autoFocus={!lead}
            aria-invalid={errors.full_name ? true : undefined}
            {...register("full_name")}
          />
        </Field>

        <Field label={t("fields.phone")} htmlFor="lead-phone" error={message(errors.phone?.message)}>
          <Input
            id="lead-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+998 90 123 45 67"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={matches.length > 0 ? "lead-phone-matches" : undefined}
            {...register("phone")}
          />
          <PhoneMatches id="lead-phone-matches" matches={matches} />
        </Field>

        <Field label={t("fields.source")} htmlFor="lead-source" error={message(errors.source?.message)}>
          <Controller
            control={control}
            name="source"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="lead-source" aria-invalid={errors.source ? true : undefined}>
                  <SelectValue placeholder={t("form.chooseSource")} />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {t(`source.${source}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field
          label={t("fields.subject")}
          htmlFor="lead-subject"
          error={message(errors.subject_interest?.message)}
        >
          <Input id="lead-subject" autoComplete="off" {...register("subject_interest")} />
        </Field>

        <Field
          label={t("fields.preferredTime")}
          htmlFor="lead-time"
          error={message(errors.preferred_time?.message)}
        >
          <Input id="lead-time" autoComplete="off" {...register("preferred_time")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.assignedTo")} htmlFor="lead-assigned">
            <Controller
              control={control}
              name="assigned_to"
              render={({ field }) => (
                <Select
                  value={field.value || UNASSIGNED}
                  onValueChange={(value) => field.onChange(value === UNASSIGNED ? "" : value)}
                >
                  <SelectTrigger id="lead-assigned">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>{t("fields.unassigned")}</SelectItem>
                    {staff.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label={t("fields.nextContact")}
            htmlFor="lead-next"
            error={message(errors.next_contact?.message)}
          >
            <Input id="lead-next" type="date" {...register("next_contact")} />
          </Field>
        </div>

        <Field label={t("fields.notes")} htmlFor="lead-notes" error={message(errors.notes?.message)}>
          <Textarea id="lead-notes" {...register("notes")} />
        </Field>

        {formError ? (
          <p role="alert" className="text-footnote text-danger">
            {t(`errors.${formError}`)}
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="secondary" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {tCommon("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

/** New lead, and Edit for an existing one. */
export function LeadFormSheet({
  open,
  lead,
  staff,
  defaultAssignee,
  onClose,
}: {
  open: boolean;
  lead: LeadDetail | null;
  staff: StaffOption[];
  defaultAssignee: string;
  onClose: () => void;
}) {
  const t = useTranslations("leads");
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t(lead ? "editLead" : "newLead")}</SheetTitle>
          <SheetDescription className="sr-only">{t(lead ? "editLead" : "newLead")}</SheetDescription>
        </SheetHeader>
        {open ? (
          <LeadForm
            key={lead?.id ?? "new"}
            lead={lead}
            staff={staff}
            defaultAssignee={defaultAssignee}
            onDone={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
