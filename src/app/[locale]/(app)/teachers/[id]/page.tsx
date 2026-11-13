import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { TeacherScreen } from "@/components/teachers/teacher-screen";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { firstValues, type SearchParams } from "@/lib/search-params";
import { getTeacher } from "@/lib/teachers/queries";
import { teacherSearchSchema } from "@/lib/validation/teachers";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: SearchParams;
};

async function Teacher({ params, searchParams }: Props) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getCurrentUser();
  if (!user) return null;
  const isOwner = user.role === "owner";
  const { tab } = teacherSearchSchema.parse(firstValues(await searchParams));

  const now = new Date();
  const teacher = await getTeacher(id, { withPay: isOwner, now });
  if (!teacher) notFound();

  return (
    <TeacherScreen
      teacher={teacher}
      role={user.role}
      // A manager who opens ?tab=pay gets the overview.
      tab={isOwner ? tab : "overview"}
      nowIso={now.toISOString()}
    />
  );
}

// The id is only known at request time, so the whole page streams in.
export default function TeacherPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Teacher {...props} />
    </Suspense>
  );
}
