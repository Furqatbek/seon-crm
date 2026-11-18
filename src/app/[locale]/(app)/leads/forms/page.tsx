import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { FormsScreen } from "@/components/forms/forms-screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { getFormsOverview } from "@/lib/forms/queries";
import { formsBaseUrl } from "@/lib/forms/url";

// Leads → Forms — docs/SPEC.md → "Lead forms add-on → Form builder → Funnels list".

async function Forms() {
  const user = await getCurrentUser();
  if (!user) return null;
  const forms = await getFormsOverview();
  return <FormsScreen forms={forms} baseUrl={formsBaseUrl(process.env.FORMS_HOST)} isOwner={user.role === "owner"} />;
}

function FormsFallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("leads")} />;
}

export default async function FormsPage({ params }: LocaleParams) {
  await initLocale(params);
  return (
    <Suspense fallback={<FormsFallback />}>
      <Forms />
    </Suspense>
  );
}
