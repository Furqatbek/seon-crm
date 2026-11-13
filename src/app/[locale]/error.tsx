"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { PageProblem } from "@/components/shell/page-problem";
import { Button } from "@/components/ui/button";

/** For pages outside the app shell: a receipt, the sign-in pages. */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common.problem");
  const router = useRouter();

  // The failed data came from the server: ask for it again, then show the page.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center bg-bg p-4">
      <PageProblem icon={TriangleAlert} title={t("errorTitle")} action={<Button onClick={retry}>{t("retry")}</Button>}>
        <span role="alert">{t("errorBody")}</span>
        {error.digest ? <span className="mt-2 block text-footnote numeric">{t("reference", { code: error.digest })}</span> : null}
      </PageProblem>
    </main>
  );
}
