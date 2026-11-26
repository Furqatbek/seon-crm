import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { AboutTab } from "@/components/settings/about-tab";
import { CentreTab } from "@/components/settings/centre-tab";
import { PointsTab } from "@/components/settings/points-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { ProfileTab } from "@/components/settings/profile-tab";
import { SourcesTab } from "@/components/settings/sources-tab";
import { formsBaseUrl } from "@/lib/forms/url";
import { getMetaIntegration } from "@/lib/meta/queries";
import { RoomsTab } from "@/components/settings/rooms-tab";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { TemplatesTab } from "@/components/settings/templates-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/app-url";
import { getSignedInUser } from "@/lib/auth";
import { getPointPresets, getPointsSettings, getTvSettings } from "@/lib/points/queries";
import { tashkentDate } from "@/lib/domain/time";
import {
  getAlertSettings,
  getAllTemplates,
  getAppTexts,
  getCentreSettings,
  getIntegrations,
  getLeadSources,
  getProfile,
  getRooms,
  getTeacherOptions,
  getUsers,
} from "@/lib/settings/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { SETTINGS_TABS, settingsSearchSchema, type SettingsTab } from "@/lib/validation/settings";

async function Settings({ searchParams, locale }: { searchParams: SearchParams; locale: Locale }) {
  const search = settingsSearchSchema.parse(firstValues(await searchParams));
  const user = await getSignedInUser();
  if (!user) return null;

  // Centre, rooms, users, notifications, templates, points, About and Privacy, lead sources and integrations are the owner's. A manager or a teacher has
  // Profile only: the other tabs are never rendered, and the database would
  // refuse the changes anyway.
  const tabs: readonly SettingsTab[] = user.role === "owner" ? SETTINGS_TABS : ["profile"];
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : tabs[0];
  const owner = user.role === "owner";

  return (
    <SettingsScreen tab={tab} tabs={tabs}>
      {tab === "centre" && owner ? <CentreTab settings={await getCentreSettings()} /> : null}
      {tab === "rooms" && owner ? <RoomsTab rooms={await getRooms()} /> : null}
      {tab === "users" && owner ? <UsersTab users={await getUsers(user.id)} teachers={await getTeacherOptions()} language={locale} /> : null}
      {tab === "notifications" && owner ? (
        <NotificationsTab settings={await getCentreSettings()} integrations={await getIntegrations()} />
      ) : null}
      {tab === "templates" && owner ? (
        <TemplatesTab
          templates={await getAllTemplates()}
          centreName={(await getCentreSettings()).centre_name}
          today={tashkentDate(new Date())}
        />
      ) : null}
      {tab === "points" && owner ? (
        <Points />
      ) : null}
      {tab === "about" && owner ? <AboutTab texts={await getAppTexts()} language={locale} /> : null}
      {tab === "sources" && owner ? (
        <SourcesTab
          data={await getLeadSources()}
          endpoint={formsBaseUrl(process.env.FORMS_HOST) ? `${formsBaseUrl(process.env.FORMS_HOST)}/api/v1/leads` : null}
        />
      ) : null}
      {tab === "integrations" && owner ? (
        <IntegrationsTab meta={await getMetaIntegration(user, search.meta === "choose")} outcome={search.meta} />
      ) : null}
      {tab === "profile" ? (
        <ProfileTab profile={await getProfile(user)} alerts={user.role === "teacher" ? null : await getAlertSettings(user)} />
      ) : null}
    </SettingsScreen>
  );
}

async function Points() {
  const [settings, presets, tv, origin] = await Promise.all([
    getPointsSettings(),
    getPointPresets({ activeOnly: false }),
    getTvSettings(),
    appUrl(),
  ]);
  return <PointsTab settings={settings} presets={presets} tv={tv} origin={origin} />;
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("settings")} tabs={7} filters={false} />;
}

export default async function SettingsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  const locale = await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Settings searchParams={searchParams} locale={locale} />
    </Suspense>
  );
}
