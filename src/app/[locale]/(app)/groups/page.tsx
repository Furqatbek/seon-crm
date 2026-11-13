import { BlockPlaceholder } from "@/components/shell/block-placeholder";
import { initLocale, type LocaleParams } from "@/i18n/params";

export default async function GroupsPage({ params }: LocaleParams) {
  await initLocale(params);
  return <BlockPlaceholder block="groups" />;
}
