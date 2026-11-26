import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { TvScreen } from "@/components/tv/tv-screen";
import { routing } from "@/i18n/routing";
import { tashkentTime } from "@/lib/domain/time";
import { getTvBoard } from "@/lib/points/queries";

type Props = { params: Promise<{ locale: string; token: string }> };

// The TV screen in the centre: no login, the secret token in the address is
// the key. The proxy has already turned a wrong token into a 404; this page
// asks the database again and shows nothing but first names and points.
async function Tv({ params }: Props) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const board = await getTvBoard(token);
  if (!board) notFound();
  // The owner chooses the TV's language in Settings, whatever the link says.
  if (board.language !== locale) redirect(`/${board.language}/tv/${token}`);

  return <TvScreen board={board} updatedAt={tashkentTime(new Date())} />;
}

export default function TvPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-dvh bg-bg [color-scheme:light]" />}>
      <Tv {...props} />
    </Suspense>
  );
}
