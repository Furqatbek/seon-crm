import { notFound } from "next/navigation";

import { initLocale, type LocaleParams } from "@/i18n/params";

import { Showcase } from "./showcase";

// Development only: every shared component in every state.
export default async function DevComponentsPage({ params }: LocaleParams) {
  if (process.env.NODE_ENV !== "development") notFound();
  await initLocale(params);
  return <Showcase />;
}
