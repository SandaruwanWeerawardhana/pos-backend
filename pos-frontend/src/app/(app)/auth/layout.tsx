"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/types/routes";

const TABS = [
  { href: ROUTES.auth.login, label: "Login" },
  { href: ROUTES.auth.register, label: "Register" },
];

const TEAM = [
  { initials: "AL", tint: "bg-secondary-container" },
  { initials: "JS", tint: "bg-tertiary-container" },
  { initials: "MK", tint: "bg-primary-container" },
  { initials: "RD", tint: "bg-inverse-surface" },
];

const WEEK = [
  { day: "Sun", date: 22 },
  { day: "Mon", date: 23 },
  { day: "Tue", date: 24 },
  { day: "Wed", date: 25 },
  { day: "Thu", date: 26 },
  { day: "Fri", date: 27 },
  { day: "Sat", date: 28 },
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface p-4 sm:p-8 dark:bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-secondary/30 blur-3xl dark:bg-secondary/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl dark:bg-primary/25"
      />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-outline-variant/60 bg-surface-container-lowest shadow-elevated md:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
        {/* form panel (left) */}
        <section className="flex flex-col gap-8 p-8 sm:p-10">
          <nav className="flex rounded-full bg-surface-container p-1 text-sm dark:bg-zinc-900">
            {TABS.map((tab) => {
              const active = pathname?.startsWith(tab.href);
              const activeClass = active
                ? "bg-surface-container-lowest text-primary shadow-elevated dark:bg-zinc-800 dark:text-white"
                : "text-on-surface-variant hover:text-on-surface dark:text-zinc-400 dark:hover:text-zinc-200";
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex-1 rounded-full px-4 py-2 text-center font-medium transition-all ${activeClass}`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {children}
        </section>

        {/* visual panel (right) */}
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-primary to-secondary p-8 text-on-primary md:block">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 -left-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
          />

          {/* top floating card */}
          <div className="relative ml-auto w-max rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
            <p className="text-sm font-semibold">Task review with team</p>
            <p className="mt-0.5 text-xs text-on-primary/70">09:30am–10:00am</p>
          </div>

          {/* overlapping avatars */}
          <div className="relative mt-10 flex justify-center">
            {TEAM.map((member, i) => (
              <span
                key={member.initials}
                className={`grid h-11 w-11 place-items-center rounded-full text-xs font-semibold text-on-primary ring-2 ring-white/50 ${member.tint} ${
                  i === 0 ? "" : "-ml-3"
                }`}
              >
                {member.initials}
              </span>
            ))}
          </div>

          {/* bottom floating card */}
          <div className="relative mt-10 rounded-2xl bg-white/15 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Daily meeting</p>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">
                10:00am
              </span>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center">
              {WEEK.map((d) => {
                const highlight = d.date === 24;
                const cellClass = highlight
                  ? "bg-tertiary-fixed text-on-tertiary-fixed"
                  : "text-on-primary/80";
                return (
                  <div key={d.day} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] text-on-primary/60">
                      {d.day}
                    </span>
                    <span
                      className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${cellClass}`}
                    >
                      {d.date}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
