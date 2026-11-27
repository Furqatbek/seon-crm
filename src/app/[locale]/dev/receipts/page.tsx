import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ReceiptsTab } from "@/components/finance/receipts-tab";
import { PaymentsTab } from "@/components/settings/payments-tab";
import { PageHeader } from "@/components/ui/page-header";
import { initLocale, type LocaleParams } from "@/i18n/params";
import type { Locale } from "@/i18n/routing";
import type { ReceiptRow } from "@/lib/receipts/queries";

type Props = LocaleParams & { searchParams: Promise<{ view?: string; receipts?: string }> };

// A small grey picture, standing in for a photographed receipt.
const PICTURE = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="112" height="128"><rect width="112" height="128" fill="#e5e5ea"/><rect x="16" y="20" width="80" height="8" fill="#aeaeb2"/><rect x="16" y="40" width="60" height="6" fill="#c7c7cc"/><rect x="16" y="54" width="70" height="6" fill="#c7c7cc"/><rect x="16" y="68" width="50" height="6" fill="#c7c7cc"/><rect x="16" y="96" width="80" height="10" fill="#aeaeb2"/></svg>')}`;

const receipt = (id: string, changes: Partial<ReceiptRow>): ReceiptRow => ({
  id,
  studentId: "student-1",
  studentName: "Aziza Karimova",
  groupId: "group-1",
  groupName: "TOPIK II · Kechki",
  amount: 600_000,
  paidOn: "2026-11-24",
  fileType: "jpg",
  fileUrl: PICTURE,
  comment: null,
  status: "pending",
  rejectReason: null,
  paymentId: null,
  receiptNo: null,
  createdAt: "2026-11-24T09:12:00Z",
  reviewedAt: null,
  reviewedBy: null,
  sameFile: false,
  sameAmountDate: false,
  ...changes,
});

const ROWS: ReceiptRow[] = [
  receipt("1", { comment: "Dekabr oyi uchun" }),
  receipt("2", { studentName: "Jasur Toshmatov", groupName: "TOPIK I · Ertalabki", amount: 550_000, fileType: "pdf", sameAmountDate: true, createdAt: "2026-11-24T10:40:00Z" }),
  receipt("3", { studentName: "Madina Rahimova", sameFile: true, sameAmountDate: true, createdAt: "2026-11-25T06:05:00Z" }),
  receipt("4", { status: "approved", paymentId: "payment-1", receiptNo: 1042, reviewedAt: "2026-11-23T11:20:00Z", reviewedBy: "Dilnoza Yusupova" }),
  receipt("5", { status: "rejected", studentName: "Otabek Salimov", amount: 300_000, rejectReason: "Summa toʻliq emas", reviewedAt: "2026-11-22T08:00:00Z", reviewedBy: "Dilnoza Yusupova" }),
];

async function Preview({ searchParams, locale }: Pick<Props, "searchParams"> & { locale: Locale }) {
  const { view, receipts } = await searchParams;
  const status = receipts === "approved" || receipts === "rejected" ? receipts : "pending";
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-4 sm:p-8">
      {view === "settings" ? (
        <>
          <PageHeader title="Settings → Payments" />
          <PaymentsTab
            language={locale}
            settings={{
              card_number: "8600123456789012",
              card_holder: "SEON TOPIK MCHJ",
              bank: "Kapitalbank",
              instructions: { uz: "1. Bank ilovangizdan shu kartaga oʻtkazing.\n2. Chekni yuklang.", ru: "1. Переведите на эту карту.\n2. Загрузите чек.", en: "1. Transfer to this card.\n2. Upload the receipt.", ko: "" },
            }}
          />
        </>
      ) : (
        <>
          <PageHeader title="Finance → Receipts" />
          <ReceiptsTab receipts={ROWS.filter((row) => row.status === status)} status={status} />
        </>
      )}
    </div>
  );
}

// Development only: Finance → Receipts and Settings → Payments with made-up
// data, without a database. ?view=settings; ?receipts=pending | approved | rejected
export default async function DevReceiptsPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== "development") notFound();
  const locale = await initLocale(params);
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} locale={locale as Locale} />
    </Suspense>
  );
}
