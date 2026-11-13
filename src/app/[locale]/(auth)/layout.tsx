import { LanguageSwitch } from "@/components/shell/language-switch";
import { initLocale, type LocaleParams } from "@/i18n/params";

// White page, one centred card, language switch in the top-right corner.
export default async function AuthLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  await initLocale(params);
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="flex justify-end p-4">
        <LanguageSwitch />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="flex w-full max-w-sm flex-col gap-6 rounded-card border border-border bg-bg p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
