import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { StudentsScreen } from "@/components/students/students-screen";
import { ListSkeleton } from "@/components/ui/skeleton";
import { initLocale, type LocaleParams } from "@/i18n/params";
import { getCurrentUser } from "@/lib/auth";
import { tashkentDate } from "@/lib/domain/time";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getCentreBilling, getGroupOptions, getStudents } from "@/lib/students/queries";
import { studentsSearchSchema } from "@/lib/validation/students";

async function Students({ searchParams }: { searchParams: SearchParams }) {
  const search = studentsSearchSchema.parse(firstValues(await searchParams));
  const user = await getCurrentUser();
  if (!user) return null;

  const [{ rows, total }, groups, billing] = await Promise.all([
    getStudents(search),
    getGroupOptions(),
    getCentreBilling(),
  ]);

  return (
    <StudentsScreen
      search={search}
      rows={rows}
      total={total}
      groups={groups}
      today={tashkentDate(new Date())}
      dueDay={billing.dueDay}
    />
  );
}

function Fallback() {
  const t = useTranslations("nav");
  return <ListSkeleton title={t("students")} />;
}

export default async function StudentsPage({
  params,
  searchParams,
}: LocaleParams & { searchParams: SearchParams }) {
  await initLocale(params);
  return (
    <Suspense fallback={<Fallback />}>
      <Students searchParams={searchParams} />
    </Suspense>
  );
}
