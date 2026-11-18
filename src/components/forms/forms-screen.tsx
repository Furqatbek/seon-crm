"use client";

import { Archive, Check, ClipboardList, Copy, FilePlus2, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { LeadsTabs } from "@/components/leads/leads-tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDate, formatPercent } from "@/lib/format";
import { archiveForm, createForm, duplicateForm } from "@/lib/forms/actions";
import type { FormOverview } from "@/lib/forms/queries";

// "blank" and the three templates of src/lib/forms/templates.ts.
const TEMPLATE_KEYS = ["blank", "course_signup", "free_trial", "consultation"] as const;

const STATUS_TONE = { draft: "neutral", live: "success", closed: "warning" } as const;

/** Leads → Forms: one row per form with its last 30 days. */
export function FormsScreen({ forms, baseUrl, isOwner }: { forms: FormOverview[] | null; baseUrl: string | null; isOwner: boolean }) {
  const t = useTranslations("forms");
  const tNav = useTranslations("nav");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<FormOverview | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (id: string) => router.push(`/leads/forms/${id}/edit`);
  const create = (template: string) =>
    start(async () => {
      const result = await createForm({ template });
      if (!result.ok) toast.error(t(`errors.${result.error}`));
      else open(result.data.id);
    });
  const duplicate = (form: FormOverview) =>
    start(async () => {
      const result = await duplicateForm({ id: form.id });
      if (!result.ok) toast.error(t(`errors.${result.error}`));
      else toast.success(t("list.duplicated", { name: form.name }));
    });
  const archive = (form: FormOverview) =>
    start(async () => {
      const result = await archiveForm({ id: form.id });
      setArchiving(null);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
      else toast.success(t("list.archived", { name: form.name }));
    });
  const copy = async (form: FormOverview) => {
    if (!baseUrl) return;
    await navigator.clipboard.writeText(`${baseUrl}/${form.slug}`).catch(() => undefined);
    setCopied(form.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const count = (value: number) => value.toLocaleString(locale === "en" ? "en-US" : "ru-RU");

  return (
    <>
      <PageHeader
        title={tNav("leads")}
        action={
          forms ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t("list.new")}
            </Button>
          ) : null
        }
      >
        <LeadsTabs active="forms" />
      </PageHeader>

      {forms === null ? (
        <EmptyState icon={ClipboardList}>{t("list.notReady")}</EmptyState>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t("list.new")}
            </Button>
          }
        >
          {t("list.empty")}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-footnote text-text-secondary">{t("list.period")}</p>
          <ul className="flex flex-col gap-3" aria-label={t("tabs.forms")}>
            {forms.map((form) => (
              <li key={form.id} data-form-row={form.slug} className="rounded-card border border-border bg-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/leads/forms/${form.id}/edit`}
                        className="text-headline break-words text-text outline-none hover:underline focus-visible:rounded-inner focus-visible:ring-3 focus-visible:ring-focus-ring"
                      >
                        {form.name}
                      </Link>
                      <StatusPill tone={STATUS_TONE[form.status]}>{t(`status.${form.status}`)}</StatusPill>
                      {form.status !== "draft" && form.hasChanges ? <StatusPill tone="brand">{t("list.unpublished")}</StatusPill> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-text-secondary">
                      <span className="break-all">{baseUrl ? `${baseUrl.replace(/^https?:\/\//, "")}/${form.slug}` : `/${form.slug}`}</span>
                      {baseUrl ? (
                        <button
                          type="button"
                          onClick={() => void copy(form)}
                          className="inline-flex items-center gap-1 rounded-inner px-1.5 py-0.5 font-medium text-brand-ink outline-none hover:bg-brand-tint focus-visible:ring-3 focus-visible:ring-focus-ring"
                        >
                          {copied === form.id ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                          {copied === form.id ? t("list.copied") : t("list.copy")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t("list.actions", { name: form.name })}>
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => open(form.id)}>
                        <Pencil aria-hidden />
                        {t("list.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={pending} onSelect={() => duplicate(form)}>
                        <Copy aria-hidden />
                        {t("list.duplicate")}
                      </DropdownMenuItem>
                      {isOwner ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setArchiving(form)}>
                            <Archive aria-hidden />
                            {t("list.archive")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  {(
                    [
                      ["views", count(form.views)],
                      ["leads", count(form.leads)],
                      ["won", count(form.won)],
                      ["conversion", form.conversion === null ? "—" : formatPercent(form.conversion, locale)],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} data-stat={key}>
                      <dt className="text-footnote text-text-secondary">{t(`list.${key}`)}</dt>
                      <dd className="text-headline text-text tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-footnote text-text-secondary">
                  {form.updatedBy
                    ? t("list.editedBy", { name: form.updatedBy, date: formatDate(form.updatedAt, locale) })
                    : t("list.edited", { date: formatDate(form.updatedAt, locale) })}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("new.title")}</DialogTitle>
            <DialogDescription>{t("new.hint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={pending}
                data-template={key}
                onClick={() => create(key)}
                className="flex flex-col items-start gap-1 rounded-card border border-border p-3 text-left outline-none motion-fast hover:border-border-strong hover:bg-bg-subtle focus-visible:ring-3 focus-visible:ring-focus-ring disabled:opacity-60"
              >
                {key === "blank" ? <FilePlus2 className="size-5 text-text-secondary" aria-hidden /> : <ClipboardList className="size-5 text-text-secondary" aria-hidden />}
                <span className="text-body font-medium text-text">{t(`new.${key}.name`)}</span>
                <span className="text-footnote text-text-secondary">{t(`new.${key}.about`)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={archiving !== null} onOpenChange={(next) => !next && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("list.archiveTitle", { name: archiving?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("list.archiveHint")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setArchiving(null)}>
              {t("list.cancel")}
            </Button>
            <Button variant="destructive-fill" disabled={pending} onClick={() => archiving && archive(archiving)}>
              {t("list.archive")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
