import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Security Questionnaire Agent",
  description: "Drafts cited answers to customer security questionnaires and flags what needs an expert.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-slate-900">Security Questionnaire Agent</Link>
            <Link href="/" className="text-slate-600 hover:text-slate-900">Run</Link>
            <Link href="/docs" className="text-slate-600 hover:text-slate-900">Knowledge base</Link>
            <Link href="/report" className="text-slate-600 hover:text-slate-900">Pilot report</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
          Demo with a fictional company&apos;s synthetic security docs. Do not paste real customer questionnaires or confidential details.
        </footer>
      </body>
    </html>
  );
}
