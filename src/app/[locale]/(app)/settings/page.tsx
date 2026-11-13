import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { CentreTab } from "@/components/settings/centre-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { ProfileTab } from "@/components/settings/profile-tab";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { TemplatesTab } from "@/components/settings/templates-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import {
  getAllTemplates,
  getCentreSettings,
  getIntegrations,
  getProfile,
  getUsers,
} from "@/lib/settings/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { SETTINGS_TABS, settingsSearchSchema, type SettingsTab } from "@/lib/validation/settings";

async function Settings({ searchParams, locale }: { searchParams: SearchParams; locale: Locale }) {
  const search = settingsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  // Centre, users, notifications and templates are the owner's. A manager has
  // Profile only: the other tabs are never rendered, and the database would
  // refuse the changes anyway.
  const tabs: readonly SettingsTab[] = user.role === "owner" ? SETTINGS_TABS : ["profile"];
  const tab = search.tab && tabs.includes(search.tab) ? search.tab : tabs[0];
  const owner = user.role === "owner";

  return (
    <SettingsScreen tab={tab} tabs={tabs}>
      {tab === "centre" && owner ? <CentreTab settings={await getCentreSettings()} /> : null}
      {tab === "users" && owner ? <UsersTab users={await getUsers(user.id)} language={locale} /> : null}
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
      {tab === "profile" ? <ProfileTab profile={await getProfile(user)} /> : null}
    </SettingsScreen>
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("settings")} tabs={5} filters={false} />;
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
