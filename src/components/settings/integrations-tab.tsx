"use client";

import { CircleAlert, Link2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatDateTime } from "@/lib/format";
import { connectMetaPages, refreshMetaForms, setMetaFormFunnel } from "@/lib/meta/actions";
import type { MetaConnectionRow, MetaIntegration } from "@/lib/meta/queries";
import type { SettingsResult } from "@/lib/validation/settings";

import { Problem, Section } from "./parts";

type Failure = Extract<SettingsResult, { ok: false }>;
type Outcome = "choose" | "cancelled" | "failed" | "state" | "not_configured";
/** No funnel: the select needs a value that is not empty. */
const NO_FUNNEL = "none";
const OUTCOME_TONE = { created: "success", merged: "brand", test: "neutral", spam: "warning", rate_limited: "warning", invalid: "danger", error: "danger" } as const;

/** After "Connect with Facebook": which of the owner's Pages to connect. */
function PagePicker({ pages }: { pages: NonNullable<MetaIntegration["pages"]> }) {
  const t = useTranslations("settings");
  const [chosen, setChosen] = useState<string[]>(pages.length === 1 ? [pages[0].id] : []);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  const connect = () =>
    startTransition(async () => {
      setFailure(null);
      const result = await connectMetaPages(chosen);
      if (!result.ok) return setFailure(result);
      toast(t("meta.connectedToast", { count: result.data.connected }));
    });

  return (
    <Section title={t("meta.choose")}>
      <p className="text-footnote text-text-secondary">{t("meta.chooseHint")}</p>
      {pages.length === 0 ? (
        <p className="text-body text-text">{t("meta.noPages")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-meta-pages>
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-2">
              <Checkbox
                id={`meta-page-${page.id}`}
                checked={chosen.includes(page.id)}
                onCheckedChange={(on) => setChosen((current) => (on === true ? [...current, page.id] : current.filter((id) => id !== page.id)))}
              />
              <Label htmlFor={`meta-page-${page.id}`}>
                {page.name}
                {page.connected ? <span className="ml-2 text-footnote font-normal text-text-secondary">{t("meta.alreadyConnected")}</span> : null}
              </Label>
            </li>
          ))}
        </ul>
      )}
      <Problem failure={failure} />
      <Button variant="primary" className="self-start" disabled={pending || chosen.length === 0} onClick={connect}>
        {t("meta.connectChosen")}
      </Button>
    </Section>
  );
}

/** One connected Page: its status, and its lead forms with a funnel each. */
function Connection({ connection, funnels, connectHref }: { connection: MetaConnectionRow; funnels: MetaIntegration["funnels"]; connectHref: string }) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();
  const broken = connection.status === "needs_reconnect";

  const refresh = () =>
    startTransition(async () => {
      setFailure(null);
      const result = await refreshMetaForms(connection.pageId);
      if (!result.ok) return setFailure(result);
      toast(t("meta.formsRefreshed"));
    });
  const setFunnel = (linkId: string, value: string) =>
    startTransition(async () => {
      const result = await setMetaFormFunnel(linkId, value === NO_FUNNEL ? null : value);
      if (!result.ok) toast(t(`errors.${result.error}`));
      else toast(t("saved"));
    });

  return (
    <li className="rounded-card border border-border bg-bg p-4" data-meta-page={connection.pageId} data-meta-status={connection.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-headline break-words text-text">{connection.pageName}</h3>
          <p className="mt-0.5 text-footnote text-text-secondary">
            {connection.lastLeadAt ? t("meta.lastLead", { time: formatDateTime(connection.lastLeadAt, locale) }) : t("meta.noLeadsYet")}
          </p>
        </div>
        <StatusPill tone={broken ? "danger" : "success"} icon={broken ? CircleAlert : undefined}>
          {t(broken ? "meta.needsReconnect" : "meta.connected")}
        </StatusPill>
      </div>

      {broken ? (
        <div className="mt-3 flex flex-col gap-2 rounded-control bg-danger-tint px-3 py-2">
          <p className="text-footnote text-danger">{t("meta.reconnectHint")}</p>
          {connection.statusDetail ? <p className="text-footnote break-words text-text-secondary">{connection.statusDetail}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant={broken ? "primary" : "secondary"}>
          <a href={connectHref} data-meta-reconnect>
            <Link2 aria-hidden />
            {t("meta.reconnect")}
          </a>
        </Button>
        <Button variant="secondary" disabled={pending || broken} onClick={refresh}>
          <RefreshCw aria-hidden />
          {t("meta.refreshForms")}
        </Button>
      </div>
      <Problem failure={failure} />

      <h4 className="mt-4 text-body font-medium text-text">{t("meta.forms")}</h4>
      {connection.forms.length === 0 ? (
        <p className="mt-1 text-footnote text-text-secondary">{t("meta.noForms")}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border" data-meta-forms>
          {connection.forms.map((form) => (
            <li key={form.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2" data-meta-form={form.metaFormId}>
              <span className="min-w-0 text-body break-words text-text">{form.name}</span>
              <Select value={form.funnelId ?? NO_FUNNEL} onValueChange={(value) => setFunnel(form.id, value)} disabled={pending}>
                <SelectTrigger aria-label={t("meta.funnelOf", { form: form.name })} className="w-56 max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FUNNEL}>{t("sources.noFunnel")}</SelectItem>
                  {funnels.map((funnel) => (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      {funnel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Integrations: Facebook and Instagram lead ads. The owner connects the
 * centre's Page(s); each lead submitted in an ad form arrives in the shared
 * inbox. docs/SPEC.md → "Lead forms add-on → Public intake URL and Meta lead ads".
 */
export function IntegrationsTab({ meta, outcome }: { meta: MetaIntegration | null; outcome: Outcome | undefined }) {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  if (!meta) return <p className="text-body text-text-secondary">{t("meta.notReady")}</p>;
  const connectHref = `/auth/meta/start?locale=${locale}`;
  const problem = outcome && outcome !== "choose" ? outcome : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h2 className="text-title text-text">{t("meta.title")}</h2>
        <p className="mt-1 text-body text-text-secondary">{t("meta.about")}</p>
      </div>

      {!meta.configured ? (
        <Section title={t("meta.setup")}>
          <p className="text-body text-text">{t("meta.notConfigured")}</p>
          <p className="font-mono text-footnote text-text-secondary">META_APP_ID · META_APP_SECRET · META_VERIFY_TOKEN</p>
          <p className="text-footnote text-text-secondary">{t("meta.guide")}</p>
        </Section>
      ) : (
        <>
          {problem ? (
            <p role="alert" className="max-w-xl rounded-control bg-danger-tint px-3 py-2 text-footnote text-danger" data-meta-problem={problem}>
              {t(`meta.problems.${problem}`)}
            </p>
          ) : null}
          {meta.pagesError ? (
            <p role="alert" className="max-w-xl rounded-control bg-danger-tint px-3 py-2 text-footnote break-words text-danger">
              {meta.pagesError}
            </p>
          ) : null}
          {outcome === "choose" && meta.pages ? <PagePicker pages={meta.pages} /> : null}

          <div className="flex flex-col gap-3">
            {meta.connections.length === 0 ? (
              <p className="text-body text-text-secondary">{t("meta.none")}</p>
            ) : (
              <ul className="flex max-w-3xl flex-col gap-3" aria-label={t("meta.pages")}>
                {meta.connections.map((connection) => (
                  <Connection key={connection.pageId} connection={connection} funnels={meta.funnels} connectHref={connectHref} />
                ))}
              </ul>
            )}
            <Button asChild variant={meta.connections.length === 0 ? "primary" : "secondary"} className="self-start">
              <a href={connectHref} data-meta-connect>
                <Link2 aria-hidden />
                {t(meta.connections.length === 0 ? "meta.connect" : "meta.connectAnother")}
              </a>
            </Button>
          </div>

          <Section title={t("meta.setup")}>
            <dl className="flex flex-col gap-3 text-footnote">
              <div>
                <dt className="text-text-secondary">{t("meta.webhookUrl")}</dt>
                <dd className="font-mono break-all text-text" data-meta-webhook>
                  {meta.webhookUrl ?? t("sources.noHost")}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary">{t("meta.verifyToken")}</dt>
                <dd className="text-text">{t(meta.verifyTokenSet ? "meta.verifyTokenSet" : "meta.verifyTokenMissing")}</dd>
              </div>
              <div>
                <dt className="text-text-secondary">{t("meta.redirectUri")}</dt>
                <dd className="font-mono break-all text-text">{meta.redirectUri}</dd>
              </div>
            </dl>
            <p className="text-footnote text-text-secondary">{t("meta.guide")}</p>
          </Section>
        </>
      )}

      {meta.recent.length > 0 ? (
        <Section title={t("meta.recent")}>
          <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto" tabIndex={0} aria-label={t("meta.recent")} data-meta-log>
            {meta.recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-outcome={row.outcome}>
                <time dateTime={row.receivedAt} className="text-footnote text-text-secondary numeric">
                  {formatDateTime(row.receivedAt, locale)}
                </time>
                <StatusPill tone={OUTCOME_TONE[row.outcome as keyof typeof OUTCOME_TONE] ?? "neutral"}>
                  {row.outcome === "test" ? t("meta.testLead") : t(`sources.outcomes.${row.outcome as keyof typeof OUTCOME_TONE}`)}
                </StatusPill>
                {row.leadId ? (
                  <Link href={`/leads?lead=${row.leadId}`} className="rounded-inner text-body text-brand-ink outline-none hover:text-brand-ink-hover focus-visible:ring-3 focus-visible:ring-focus-ring">
                    {row.leadName ?? t("sources.openLead")}
                  </Link>
                ) : row.detail && row.outcome !== "test" ? (
                  <span className="min-w-0 text-footnote break-words text-text-secondary">{row.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
