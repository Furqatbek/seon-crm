import { SearchX } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageProblem } from "@/components/shell/page-problem";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** A record that does not exist, or a link with a broken id. */
export default function AppNotFound() {
  const t = useTranslations("common.problem");
  return (
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
  );
}
