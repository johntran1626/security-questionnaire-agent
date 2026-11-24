"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  { href: "/", label: "Run" },
  { href: "/docs", label: "Knowledge base" },
  { href: "/report", label: "Pilot report" },
];

const iconLink =
  "grid size-8 place-items-center rounded-xl border-2 border-ink bg-white text-ink transition hover:-translate-y-px hover:bg-sky hover:shadow-pop-xs lg:size-9";

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="font-display text-[22px] leading-tight text-ink lg:text-[28px]">
          Security questionnaire agent <span className="text-blue">by John Tran</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Author">
          <a href="https://github.com/johntran1626" target="_blank" rel="noopener noreferrer" aria-label="John Tran on GitHub (opens in a new tab)" title="GitHub" className={iconLink}>
            <svg viewBox="0 0 24 24" className="size-[18px] lg:size-5" fill="currentColor" aria-hidden="true">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
          <a href="https://www.linkedin.com/in/johnthientran/" target="_blank" rel="noopener noreferrer" aria-label="John Tran on LinkedIn (opens in a new tab)" title="LinkedIn" className={iconLink}>
            <svg viewBox="0 0 24 24" className="size-[18px] lg:size-5" fill="currentColor" aria-hidden="true">
              <circle cx="5.2" cy="5.2" r="2.3" />
              <rect x="3.2" y="9" width="4" height="12" rx="0.6" />
              <path d="M9.6 9h3.8v1.7c.7-1.2 2.1-2 3.9-2 3 0 4.3 1.9 4.3 5.1V21h-4v-6.4c0-1.6-.6-2.5-1.9-2.5-1.4 0-2.1 1-2.1 2.5V21h-4z" />
            </svg>
          </a>
        </nav>
      </div>
      <nav aria-label="Pages" className="flex overflow-hidden rounded-xl border-[2.5px] border-ink shadow-pop-xs">
        {PAGES.map((p, i) => {
          const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
          return (
            <Link
              key={p.href}
              href={p.href}
              aria-current={active ? "page" : undefined}
              className={`px-2.5 py-1.5 font-display text-sm whitespace-nowrap lg:px-3.5 lg:py-[7px] lg:text-base ${i > 0 ? "border-l-[2.5px] border-ink" : ""} ${active ? "bg-ink text-white" : "bg-white text-ink hover:bg-sky"}`}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
