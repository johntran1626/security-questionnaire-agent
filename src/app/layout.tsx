import type { Metadata } from "next";
import { Jua, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const jua = Jua({ variable: "--font-jua", weight: "400", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Security Questionnaire Agent",
  description: "Drafts cited answers to customer security questionnaires and flags what needs an expert.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jua.variable} ${outfit.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div className="flex min-h-dvh w-full flex-col px-4 pt-5 pb-7 sm:px-[22px] lg:px-10 lg:pt-7 lg:pb-10">
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1160px] flex-1 pt-8 lg:pt-12">{children}</main>
          <footer className="mx-auto mt-12 w-full max-w-[1160px] border-t-[2.5px] border-ink pt-4 text-center text-sm text-neutral-600">
            Demo with a fictional company&apos;s synthetic security docs. Do not paste real customer questionnaires or confidential details.
          </footer>
        </div>
      </body>
    </html>
  );
}
