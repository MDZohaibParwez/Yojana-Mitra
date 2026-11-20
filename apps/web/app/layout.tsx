import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { LANG_LOCALE } from "@ym/core/i18n";
import { LangSwitcher } from "@/components/lang-switcher";
import { SafetyNotice } from "@/components/notice";
import { currentLang } from "@/lib/lang";
import { t } from "@/lib/strings";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Yojana Mitra – find government schemes you qualify for", template: "%s · Yojana Mitra" },
  description: "Free help to find Indian government schemes (central and state) you are eligible for, in Hindi, English and more. Always apply on the official link.",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1a6b45" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  const s = t(lang);
  return (
    <html lang={LANG_LOCALE[lang]}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
        <SafetyNotice lang={lang} />
        <header className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link href="/" className="text-xl font-bold text-primary">{s.title}</Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/chat" className="underline-offset-4 hover:underline">{s.chat}</Link>
            <LangSwitcher lang={lang} label={s.language} />
          </nav>
        </header>
        <main id="main" className="mx-auto max-w-3xl px-4 pb-16">{children}</main>
        <footer className="mx-auto max-w-3xl border-t border-border px-4 py-6 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-4">
            <Link href="/about">{s.about}</Link>
            <Link href="/privacy">{s.privacy}</Link>
            <Link href="/terms">{s.terms}</Link>
          </nav>
        </footer>
      </body>
    </html>
  );
}
