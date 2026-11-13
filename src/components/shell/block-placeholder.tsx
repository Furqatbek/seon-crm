import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

import { ALL_BLOCKS, type BlockKey } from "./blocks";

/** What every block route shows until its phase builds the real screen. */
export function BlockPlaceholder({ block }: { block: BlockKey }) {
  const tNav = useTranslations("nav");
  const tEmpty = useTranslations("empty");
  const { icon } = ALL_BLOCKS.find((candidate) => candidate.key === block)!;

  return (
    <>
      <PageHeader title={tNav(block)} />
      <EmptyState icon={icon}>{tEmpty(block)}</EmptyState>
    </>
  );
}
