import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageProblem } from "@/components/shell/page-problem";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** For pages outside the app shell: a receipt that does not exist. */
export default function LocaleNotFound() {
  const t = useTranslations("common.problem");
  return (
    <main className="flex min-h-dvh items-center bg-bg p-4">
      <PageProblem
        icon={SearchX}
        title={t("notFoundTitle")}
        action={
          <Button asChild>
            <Link href="/">{t("home")}</Link>
          </Button>
        }
      >
        {t("notFoundBody")}
      </PageProblem>
    </main>
  );
}
