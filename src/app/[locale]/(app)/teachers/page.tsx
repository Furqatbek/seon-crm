import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { TeachersScreen } from "@/components/teachers/teachers-screen";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { getTeachers } from "@/lib/teachers/queries";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { teachersSearchSchema } from "@/lib/validation/teachers";

async function Teachers({ searchParams }: { searchParams: SearchParams }) {
  const search = teachersSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  // Pay is the owner's: a manager's page never asks for it.
  const { rows, total } = await getTeachers(search, {
    withPay: user.role === "owner",
    now: new Date(),
  });
  return <TeachersScreen search={search} rows={rows} total={total} role={user.role} />;
}

function Fallback() {
  const t = useTranslations("nav");
  return <PageHeader title={t("teachers")} />;
}

export default async function TeachersPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Teachers searchParams={searchParams} />
    </Suspense>
  );
}
