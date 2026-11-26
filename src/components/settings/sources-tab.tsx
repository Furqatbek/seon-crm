"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDateTime } from "@/lib/format";
import { createLeadSource, getLeadSourceLog, setLeadSourceActive, updateLeadSource, type SourceLogRow } from "@/lib/settings/actions";
import type { LeadSource, LeadSourcesData } from "@/lib/settings/queries";
import {
  SOURCE_MAP_TARGETS,
  leadSourceSchema,
  type LeadSourceInput,
  type LeadSourceValues,
  type SettingsErrorKey,
  type SettingsResult,
} from "@/lib/validation/settings";

import { Problem } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;
/** No funnel: the select needs a value that is not empty. */
const NO_FORM = "none";

const OUTCOME_TONE = { created: "success", merged: "brand", test: "neutral", spam: "warning", rate_limited: "warning", invalid: "danger", error: "danger" } as const;

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations("settings");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t("sources.copied") : label}
    </Button>
  );
}

/** Add a source, or edit its name, funnel and field map. */
function SourceForm({
  source,
  forms,
  onClose,
  onCreated,
}: {
  source: LeadSource | null;
  forms: LeadSourcesData["forms"];
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LeadSourceInput, unknown, LeadSourceValues>({
    resolver: zodResolver(leadSourceSchema),
    defaultValues: {
      name: source?.name ?? "",
      form_id: source?.formId ?? "",
      fields: Object.entries(source?.fieldMap ?? {}).map(([from, to]) => ({ from, to: to as LeadSourceValues["fields"][number]["to"] })),
    },
  });
  const rows = useFieldArray({ control, name: "fields" });
  const message = (key: string | undefined) => (key ? t(`errors.${key as SettingsErrorKey}`) : null);

  const onSubmit = handleSubmit((values) => {
    setFailure(null);
    startTransition(async () => {
      if (source) {
        const result = await updateLeadSource(source.id, values);
        if (!result.ok) return setFailure(result);
        toast(t("saved"));
        onClose();
      } else {
        const result = await createLeadSource(values);
        if (!result.ok) return setFailure(result);
        onCreated(result.data.key);
      }
    });
  });

  return (
    <SheetContent>
      <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
        <SheetHeader>
          <SheetTitle>{t(source ? "sources.edit" : "sources.add")}</SheetTitle>
          <SheetDescription>{t("sources.formHint")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="gap-5">
          <Field label={t("sources.name")} htmlFor="source-name" error={message(errors.name?.message)}>
            <Input id="source-name" placeholder={t("sources.namePlaceholder")} aria-invalid={errors.name ? true : undefined} {...register("name")} />
          </Field>
          <Field label={t("sources.funnel")} htmlFor="source-form">
            <Controller
              control={control}
              name="form_id"
              render={({ field }) => (
                <Select value={field.value || NO_FORM} onValueChange={(value) => field.onChange(value === NO_FORM ? "" : value)}>
                  <SelectTrigger id="source-form">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FORM}>{t("sources.noFunnel")}</SelectItem>
                    {forms.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-footnote text-text-secondary">{t("sources.funnelHint")}</p>
          </Field>

          <fieldset className="flex flex-col gap-2" data-field-map>
            <legend className="text-headline text-text">{t("sources.map")}</legend>
            <p className="text-footnote text-text-secondary">{t("sources.mapHint")}</p>
            {rows.fields.map((row, index) => (
              <div key={row.id} className="flex items-start gap-2" data-map-row>
                <Input
                  aria-label={t("sources.mapFrom", { n: index + 1 })}
                  placeholder={t("sources.mapFromPlaceholder")}
                  spellCheck={false}
                  autoCapitalize="none"
                  className="min-w-0 flex-1"
                  {...register(`fields.${index}.from`)}
                />
                <Controller
                  control={control}
                  name={`fields.${index}.to`}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label={t("sources.mapTo", { n: index + 1 })} className="w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_MAP_TARGETS.map((target) => (
                          <SelectItem key={target} value={target}>
                            {t(`sources.targets.${target}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Button type="button" variant="ghost" size="icon" aria-label={t("sources.mapRemove", { n: index + 1 })} onClick={() => rows.remove(index)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" className="self-start" onClick={() => rows.append({ from: "", to: "name" })}>
              <Plus aria-hidden />
              {t("sources.mapAdd")}
            </Button>
          </fieldset>
          <Problem failure={failure} />
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {source ? tCommon("save") : t("sources.create")}
          </Button>
        </SheetFooter>
      </form>
    </SheetContent>
  );
}

/** The new key, shown once, with a request to try it with. */
function KeyDialog({ secret, endpoint, onClose }: { secret: string | null; endpoint: string | null; onClose: () => void }) {
  const t = useTranslations("settings");
  const url = endpoint ?? "https://forms.example.uz/api/v1/leads";
  const example = secret
    ? `curl -X POST ${url} \\\n  -H "Authorization: Bearer ${secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Aziza Karimova","phone":"+998901234567"}'`
    : "";
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sources.keyTitle")}</DialogTitle>
          <DialogDescription>{t("sources.keyHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input readOnly value={secret ?? ""} aria-label={t("sources.key")} className="font-mono" onFocus={(event) => event.target.select()} data-new-key />
          <Textarea readOnly rows={5} value={example} aria-label={t("sources.example")} className="font-mono text-footnote" />
          {endpoint ? null : <p className="text-footnote text-text-secondary">{t("sources.noHost")}</p>}
        </div>
        <DialogFooter>
          <CopyButton text={secret ?? ""} label={t("sources.copyKey")} />
          <Button variant="primary" onClick={onClose}>
            {t("sources.keySaved")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The last 100 requests of a source and what became of each. */
function LogDialog({ source, onClose }: { source: LeadSource | null; onClose: () => void }) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const [rows, setRows] = useState<SourceLogRow[] | null>(null);
  const id = source?.id;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getLeadSourceLog(id).then((result) => {
      if (!cancelled) setRows(result.ok ? result.data : []);
    });
    return () => {
      cancelled = true;
      setRows(null);
    };
  }, [id]);

  return (
    <Dialog open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("sources.logTitle", { name: source?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("sources.logHint")}</DialogDescription>
        </DialogHeader>
        {rows === null ? (
          <p className="text-body text-text-secondary">{t("sources.logLoading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-body text-text-secondary">{t("sources.logEmpty")}</p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto" tabIndex={0} aria-label={t("sources.logTitle", { name: source?.name ?? "" })} data-source-log>
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-outcome={row.outcome}>
                <time dateTime={row.receivedAt} className="text-footnote text-text-secondary numeric">
                  {formatDateTime(row.receivedAt, locale)}
                </time>
                <StatusPill tone={OUTCOME_TONE[row.outcome as keyof typeof OUTCOME_TONE] ?? "neutral"}>
                  {t(`sources.outcomes.${row.outcome as keyof typeof OUTCOME_TONE}`)}
                </StatusPill>
                {row.leadId ? (
                  <Link href={`/leads?lead=${row.leadId}`} className="rounded-inner text-body text-brand-ink outline-none hover:text-brand-ink-hover focus-visible:ring-3 focus-visible:ring-focus-ring">
                    {row.leadName ?? t("sources.openLead")}
                  </Link>
                ) : row.detail ? (
                  <span className="min-w-0 text-footnote break-words text-text-secondary">{row.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lead sources: one secret key per website or landing page that posts leads to
 * the intake API. docs/SPEC.md → "Lead forms add-on → Public intake URL".
 */
export function SourcesTab({ data, endpoint }: { data: LeadSourcesData | null; endpoint: string | null }) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<{ source: LeadSource | null } | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [logOf, setLogOf] = useState<LeadSource | null>(null);
  const [pending, startTransition] = useTransition();

  if (!data) return <EmptyState icon={KeyRound}>{t("sources.notReady")}</EmptyState>;
  const formName = (id: string | null) => data.forms.find((form) => form.id === id)?.name ?? null;
  const toggle = (source: LeadSource, on: boolean) =>
    startTransition(async () => {
      const result = await setLeadSourceActive(source.id, on);
      if (!result.ok) toast(t(`errors.${result.error}`));
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-body text-text-secondary">{t("sources.about")}</p>
          {endpoint ? (
            <p className="mt-1 font-mono text-footnote break-all text-text" data-endpoint>
              POST {endpoint}
            </p>
          ) : (
            <p className="mt-1 text-footnote text-text-secondary">{t("sources.noHost")}</p>
          )}
        </div>
        <Button variant="primary" onClick={() => setEditing({ source: null })}>
          <Plus aria-hidden />
          {t("sources.add")}
        </Button>
      </div>

      {data.sources.length === 0 ? (
        <EmptyState icon={KeyRound}>{t("sources.empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t("tabs.sources")}>
          {data.sources.map((source) => (
            <li key={source.id} className="rounded-card border border-border bg-bg p-4" data-source={source.name}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-headline break-words text-text">{source.name}</h2>
                  <p className="mt-0.5 font-mono text-footnote text-text-secondary">{source.keyPrefix}_…</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={`source-on-${source.id}`} className="text-footnote text-text-secondary">
                    {t(source.isActive ? "sources.on" : "sources.off")}
                  </label>
                  <Switch id={`source-on-${source.id}`} checked={source.isActive} disabled={pending} onCheckedChange={(on) => toggle(source, on)} />
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-footnote sm:grid-cols-3">
                <div>
                  <dt className="text-text-secondary">{t("sources.funnel")}</dt>
                  <dd className="break-words text-text">{formName(source.formId) ?? t("sources.noFunnel")}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{t("sources.lastUsed")}</dt>
                  <dd className="text-text" data-last-used>
                    {source.lastUsedAt ? formatDateTime(source.lastUsedAt, locale) : t("sources.never")}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{t("sources.map")}</dt>
                  <dd className="text-text">{t("sources.mapCount", { count: Object.keys(source.fieldMap).length })}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing({ source })}>
                  <Pencil aria-hidden />
                  {t("sources.edit")}
                </Button>
                <Button variant="secondary" onClick={() => setLogOf(source)}>
                  <ListChecks aria-hidden />
                  {t("sources.requests")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <SourceForm
            key={editing.source?.id ?? "new"}
            source={editing.source}
            forms={data.forms}
            onClose={() => setEditing(null)}
            onCreated={(key) => {
              setEditing(null);
              setNewKey(key);
            }}
          />
        ) : null}
      </Sheet>
      <KeyDialog secret={newKey} endpoint={endpoint} onClose={() => setNewKey(null)} />
      <LogDialog source={logOf} onClose={() => setLogOf(null)} />
    </div>
  );
}
