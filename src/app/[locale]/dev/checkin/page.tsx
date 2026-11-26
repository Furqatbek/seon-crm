import { notFound } from "next/navigation";
import { Suspense } from "react";

import { initLocale, type LocaleParams } from "@/i18n/params";

import { CheckinPreview } from "./preview";

type Props = LocaleParams & { searchParams: Promise<{ state?: string }> };

async function Preview({ searchParams }: Pick<Props, "searchParams">) {
  return <CheckinPreview state={(await searchParams).state ?? "idle"} />;
}

// Development only: the reception scanner in each of its states, without a
// database. ?state=idle | arrived | left | error | search
export default async function DevCheckinPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  await initLocale(params);
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}
