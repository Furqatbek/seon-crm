import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { ReceiptView } from "@/components/finance/receipt-view";
import { RecordSkeleton } from "@/components/ui/skeleton";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth";
import { getReceipt } from "@/lib/finance/queries";

type Props = { params: Promise<{ locale: string; id: string }> };

// The print view of one payment. It sits outside the app shell so that only
// the receipt is printed; the proxy still requires a session.
async function Receipt({ params }: Props) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/sign-out?locale=${locale}`);

  const receipt = await getReceipt(id);
  if (!receipt) notFound();
  return <ReceiptView receipt={receipt} />;
}

export default function ReceiptPage(props: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md p-6"><RecordSkeleton /></div>}>
      <Receipt {...props} />
    </Suspense>
  );
}
