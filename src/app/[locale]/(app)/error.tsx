"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { PageProblem } from "@/components/shell/page-problem";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of any list or record page that failed to load (the database
 * did not answer, a query was refused). The sidebar stays, so the user can go
 * elsewhere or try again.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.problem");
  const router = useRouter();

  // The failed data came from the server: ask for it again, then show the page.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    // For the server log and the browser console; the user is not shown internals.
    console.error(error);
  }, [error]);

  return (
    <PageProblem icon={TriangleAlert} title={t("errorTitle")} action={<Button onClick={retry}>{t("retry")}</Button>}>
      <span role="alert">{t("errorBody")}</span>
      {error.digest ? <span className="mt-2 block text-footnote numeric">{t("reference", { code: error.digest })}</span> : null}
    </PageProblem>
  );
}
