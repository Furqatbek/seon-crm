"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlState } from "@/lib/hooks/use-url-state";
import type { SettingsTab } from "@/lib/validation/settings";

/**
 * The Settings frame. The owner has every tab; a manager has only Profile,
 * so there is no tab bar to show. The open tab is rendered on the server.
 */
export function SettingsScreen({
  tab,
  tabs,
  children,
}: {
  tab: SettingsTab;
  tabs: readonly SettingsTab[];
  children: React.ReactNode;
}) {
  const t = useTranslations("settings");
  const tNav = useTranslations("nav");
  const { setParams } = useUrlState();
  const [shownTab, showTab] = useOptimistic(tab);
  const [, startTabChange] = useTransition();

  if (tabs.length === 1) {
    return (
      <>
        <PageHeader title={t(`tabs.${tab}`)} />
        {children}
      </>
    );
  }

  return (
    <>
      <PageHeader title={tNav("settings")} />
      <Tabs
        value={shownTab}
        onValueChange={(value) =>
          startTabChange(() => {
            showTab(value as SettingsTab);
            setParams({ tab: value === tabs[0] ? null : value });
          })
        }
        className="gap-6"
      >
        <TabsList>
          {tabs.map((name) => (
            <TabsTrigger key={name} value={name}>
              {t(`tabs.${name}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={shownTab}>{children}</TabsContent>
      </Tabs>
    </>
  );
}
