import Link from "next/link";
import { ROUTES } from "@/lib/types/routes";
import { PwaInstallButton } from "@/components/shell/pwa-install-button";

const features = [
  {
    title: "Offline-first",
    description:
      "IndexedDB is the source of truth. Sales, cart, and product lookups keep working with no connection at all.",
  },
  {
    title: "Background sync",
    description:
      "Pending orders reconcile with the server automatically in the background, no manual refresh required.",
  },
  {
    title: "Fast local search",
    description:
      "Product search runs against the local cache, so checkout stays instant even on a slow network.",
  },
];

const stats = [
  { value: "0ms", label: "Checkout stalls when offline" },
  { value: "15s", label: "Background sync interval" },
  { value: "100%", label: "Sales captured, on or off the grid" },
];

const receiptLines = [
  { label: "Jasmine Rice 5kg", amount: "840" },
  { label: "Milk Powder 400g", amount: "620" },
  { label: "Cooking Oil 1L", amount: "980" },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-[#060610]">
      <main className="flex flex-1 flex-col items-center px-6">
        <section className="flex w-full max-w-4xl flex-col items-center gap-6 py-24 text-center">
          <span className="rounded-full border border-[#E63946]/30 bg-[#E63946]/10 px-4 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#ff8a9a]">
            Local-first · works offline
          </span>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Point of sale that never
            <br />
            waits for a{" "}
            <span className="bg-gradient-to-r from-[#E63946] to-[#ff8a9a] bg-clip-text text-transparent">
              signal.
            </span>
          </h1>
          <p className="max-w-xl text-lg leading-8 text-[#9ca3af]">
            A local-first POS built for busy counters. Every sale is saved
            instantly on the device and synced to the server the moment
            connectivity comes back.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={ROUTES.auth.login}
              className="mt-2 rounded-full bg-gradient-to-r from-[#E63946] to-[#c1121f] px-8 py-3 text-base font-medium text-white shadow-[0_8px_30px_-8px_rgba(230,57,70,0.6)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E63946]"
            >
              Sign in
            </Link>
            <PwaInstallButton />
          </div>
        </section>

        <section className="w-full max-w-2xl pb-20">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b1a] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 bg-[#101028] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
              <span className="ml-3 font-mono text-xs text-[#9ca3af]">
                till-04.local — offline
              </span>
            </div>
            <div className="flex flex-col gap-3 p-6 font-mono text-sm">
              {receiptLines.map((line) => (
                <div key={line.label} className="flex justify-between text-[#e5e7eb]">
                  <span>{line.label}</span>
                  <span className="tabular-nums text-[#9ca3af]">{line.amount}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-white/10 pt-3 text-xs text-[#ff8a9a]">
                3 sales queued — will sync when back online
              </div>
            </div>
          </div>
        </section>

        <section className="grid w-full max-w-3xl grid-cols-1 gap-8 pb-20 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1 text-center">
              <span className="bg-gradient-to-r from-[#E63946] to-[#ff8a9a] bg-clip-text text-3xl font-bold text-transparent">
                {stat.value}
              </span>
              <span className="text-sm text-[#9ca3af]">{stat.label}</span>
            </div>
          ))}
        </section>

        <section className="grid w-full max-w-4xl grid-cols-1 gap-6 pb-24 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-[#0b0b1a] p-6 transition-colors hover:border-[#E63946]/40"
            >
              <h2 className="text-lg font-semibold text-white">
                {feature.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#9ca3af]">
                {feature.description}
              </p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
