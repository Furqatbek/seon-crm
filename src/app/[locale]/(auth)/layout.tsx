import Image from "next/image";

import { LanguageSwitch } from "@/components/shell/language-switch";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { initLocale, type LocaleParams } from "@/i18n/params";

// The centre's mark, 500 × 500, on a transparent background.
const LOGO = "/brand/seon-topik.png";

// Sign-in and the other pages before it. On a computer: the centre's mark on
// a brand-tinted half, the card on the other. On a phone: the mark above the
// card. The language and theme switches stay in the top-right corner.
export default async function AuthLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  await initLocale(params);
  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      {/* The brand half. The mark carries the centre's name; the page's own heading says it in text. */}
      <aside
        aria-hidden
        data-slot="auth-brand"
        className="relative hidden flex-1 items-center justify-center overflow-hidden bg-brand-tint lg:flex"
      >
        {/* Two soft rings behind the mark, in the brand colour. */}
        <span className="absolute size-[34rem] rounded-full border border-brand opacity-20" />
        <span className="absolute size-[46rem] rounded-full border border-brand opacity-10" />
        <Image src={LOGO} alt="" width={500} height={500} priority className="relative size-80 xl:size-96" />
        <span className="absolute inset-x-0 bottom-0 h-1.5 bg-brand" />
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
        <div className="flex justify-end gap-1 p-4">
          <ThemeSwitch />
          <LanguageSwitch />
        </div>
        <main className="flex flex-1 flex-col items-center justify-center gap-2 px-4 pb-16">
          <Image src={LOGO} alt="" width={500} height={500} priority className="size-40 lg:hidden" data-slot="auth-logo" />
          <div className="flex w-full max-w-sm flex-col gap-6 rounded-card border border-t-4 border-border border-t-brand bg-bg p-6 shadow-float sm:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
