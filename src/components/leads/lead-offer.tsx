"use client";

import { useTranslations } from "next-intl";

import { MoneyText } from "@/components/ui/money-text";
import { StatusPill } from "@/components/ui/status-pill";
import type { Locale } from "@/i18n/routing";
import { formatDate, formatDay } from "@/lib/format";
import type { LeadBooking, LeadOffer, LeadVoucher } from "@/lib/offers/queries";

const VOUCHER_TONE = { issued: "brand", redeemed: "success", expired: "neutral" } as const;
const BOOKING_TONE = { booked: "brand", came: "success", no_show: "danger", cancelled: "neutral" } as const;

/** "20% off the first month", "100 000 soʻm off the first month", "7 free days". */
export function VoucherWorth({ voucher }: { voucher: Pick<LeadVoucher, "type" | "value"> }) {
  const t = useTranslations("offers.worth");
  if (voucher.type === "fixed") return t.rich("fixed", { amount: () => <MoneyText amount={voucher.value} /> });
  return t(voucher.type, { value: voucher.value });
}

/**
 * What the student app gave this lead's person: their voucher, with its code
 * for the enrol sheet, and their open-lesson bookings with how each went.
 */
export function LeadOfferSection({ offer, locale }: { offer: LeadOffer; locale: Locale }) {
  const t = useTranslations("offers.lead");
  const tStatus = useTranslations("offers.voucherStatus");
  const tBooking = useTranslations("offers.bookingStatus");
  if (!offer.voucher && offer.bookings.length === 0) return null;
  const { voucher } = offer;
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border p-3" data-slot="lead-offer">
      <h3 className="text-footnote font-medium text-text-secondary">{t("title")}</h3>
      {voucher ? (
        <div className="flex flex-col gap-1" data-voucher={voucher.status}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-inner bg-bg-subtle px-2 py-0.5 text-body font-medium text-text numeric" data-voucher-code>
              {voucher.code}
            </code>
            <StatusPill tone={VOUCHER_TONE[voucher.status]}>{tStatus(voucher.status)}</StatusPill>
          </div>
          <p className="text-body text-text">
            <VoucherWorth voucher={voucher} />
          </p>
          <p className="text-footnote text-text-secondary">
            {voucher.status === "redeemed" && voucher.redeemed_at
              ? t("redeemedOn", { date: formatDate(voucher.redeemed_at, locale, { year: true }) })
              : t(voucher.status === "expired" ? "expiredOn" : "validUntil", { date: formatDate(voucher.expires_at, locale, { year: true }) })}
          </p>
        </div>
      ) : null}
      {offer.bookings.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={t("bookings")}>
          {offer.bookings.map((booking: LeadBooking) => (
            <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2" data-booking={booking.status}>
              <span className="text-body text-text">
                {booking.title} · {formatDay(booking.session_date, locale, { month: "long" })}, <span className="numeric">{booking.start_time}</span>
              </span>
              <StatusPill tone={BOOKING_TONE[booking.status]}>{tBooking(booking.status)}</StatusPill>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
