"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NotificationPanel } from "@/components/shell/notification-panel";
import { useAuth } from "@/lib/hooks/use-auth";
import { useAuthStore } from "@/lib/store/auth";
import { useSettings } from "@/lib/hooks/use-settings";
import { ROUTES } from "@/lib/types/routes";
import { Skeleton } from "@/components/ui/Skeleton";
import { SIDEBAR_HEADER_OFFSET_CLASS } from "@/lib/layout";
import {
  Globe,
  KeyRound,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Monitor,
  Search,
  User as UserIcon,
  Wifi,
  WifiOff,
} from "lucide-react";

const LOCALE_OPTIONS = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
];

const OFFICE_SIDEBAR_PATHS = [
  ROUTES.dashboard,
  ROUTES.products,
  ROUTES.inventory.root,
  ROUTES.purchases.root,
  ROUTES.sales.root,
  ROUTES.suppliers,
  ROUTES.people.root,
  ROUTES.reports,
  ROUTES.discounts,
  ROUTES.users.root,
  ROUTES.settings.root,
  ROUTES.profile,
  ROUTES.admin,
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function openCommandPalette() {
  // The palette owns the Ctrl/Cmd+K listener; synthesising the same event
  // keeps one source of truth for "open search" rather than lifting the
  // palette's open state into a store purely for this button.
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
  );
}

function handleToggleSidebar() {
  window.dispatchEvent(new Event("swiftpos:toggle-sidebar"));
}

function handleToggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

function subscribeAuthHydration(onStoreChange: () => void) {
  return useAuthStore.persist?.onFinishHydration(onStoreChange) ?? (() => {});
}

function getAuthHydrationSnapshot() {
  return useAuthStore.persist?.hasHydrated?.() ?? true;
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, staff, isAuthenticated, posOnly, logout } = useAuth();
  const { settings, save } = useSettings();
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const hydrated = useSyncExternalStore(
    subscribeAuthHydration,
    getAuthHydrationSnapshot,
    () => false,
  );

  // A till-only session never reaches an office route, so the sidebar toggle,
  // global search, and profile links are dropped rather than left as dead ends.
  const hasOfficeSidebar =
    !posOnly && OFFICE_SIDEBAR_PATHS.some((href) => pathname?.startsWith(href));

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const syncTimerId = window.setTimeout(() => setOnline(navigator.onLine), 0);
    return () => {
      window.clearTimeout(syncTimerId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const syncTimerId = window.setTimeout(updateClock, 0);
    const timerId = window.setInterval(updateClock, 1000);
    return () => {
      window.clearTimeout(syncTimerId);
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!langOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!langRef.current?.contains(event.target as Node)) setLangOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [langOpen]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.replace(ROUTES.auth.login);
  }

  if (!hydrated) {
    return (
      <header
        className={`fixed left-0 right-0 top-0 z-[70] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 shadow-sm sm:px-4 dark:border-zinc-800 dark:bg-zinc-950 ${SIDEBAR_HEADER_OFFSET_CLASS}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Skeleton className="h-5 w-24 rounded" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Skeleton className="hidden h-6 w-16 rounded-full sm:block" />
          <Skeleton className="hidden h-6 w-16 rounded-full sm:block" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>
    );
  }

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-[70] flex h-14 shrink-0 items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 shadow-sm sm:px-4 dark:border-zinc-800 dark:bg-zinc-950 ${
        hasOfficeSidebar ? SIDEBAR_HEADER_OFFSET_CLASS : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {!posOnly && (
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={handleToggleSidebar}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:text-on-surface active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 md:hidden"
        >
          <Menu size={18} />
        </button>
        )}
        {!posOnly && (
        <button
          type="button"
          onClick={openCommandPalette}
          className="group ml-2 hidden min-w-0 max-w-xs flex-1 items-center gap-2 rounded-xl border border-outline-variant px-3 py-1.5 text-xs text-on-surface-variant transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-primary/40 hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:flex dark:border-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-800"
        >
          <Search
            size={13}
            aria-hidden
            className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110"
          />
          <span className="flex-1 text-left">Search everything…</span>
        </button>
        )}
      </div>

      <span className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center text-xs font-medium text-on-surface-variant xl:block dark:text-zinc-400">
        <span className="block text-sm font-semibold text-on-surface dark:text-zinc-100">
          {now ? formatTime(now) : "--:--"}
        </span>
        {now ? formatDate(now) : "..."}
      </span>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {!posOnly && (
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <Search size={15} />
        </button>
        )}

        {!posOnly && (
          <Link
            href={ROUTES.pos.root}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-semibold text-on-primary transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] hover:scale-105 active:scale-95"
          >
            <Monitor size={14} aria-hidden />
            POS
          </Link>
        )}

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
            online
              ? "bg-[#004b1e] text-[#bbf7d0] dark:bg-green-900/50 dark:text-green-300"
              : "bg-error text-on-error dark:bg-red-900/50 dark:text-red-300"
          }`}
        >
          <span key={online ? "on" : "off"} className="animate-scale-in">
            {online ? (
              <Wifi size={13} aria-hidden />
            ) : (
              <WifiOff size={13} aria-hidden />
            )}
          </span>
          <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
        </span>

        <ThemeToggle />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        <div ref={langRef} className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((current) => !current)}
            aria-expanded={langOpen}
            aria-haspopup="menu"
            aria-label="Change language"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Globe size={15} />
          </button>
          {langOpen && (
            <div
              role="menu"
              className="animate-scale-in absolute right-0 top-10 z-[120] w-44 origin-top-right overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest py-1 shadow-popover dark:border-zinc-800 dark:bg-zinc-900"
            >
              {LOCALE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void save({ locale: option.code });
                    setLangOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-surface-container dark:hover:bg-zinc-800 ${
                    settings.locale === option.code
                      ? "font-semibold text-primary dark:text-blue-400"
                      : "text-on-surface dark:text-zinc-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <NotificationPanel />

        {isAuthenticated && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Account menu"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary transition-transform duration-[var(--duration-fast)] ease-[var(--ease-spring)] hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {(user?.name ?? "?").charAt(0).toUpperCase()}
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="animate-scale-in absolute right-0 top-10 z-[120] w-56 origin-top-right overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-popover dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="border-b border-outline-variant px-4 py-3 dark:border-zinc-800">
                  <p className="truncate text-sm font-semibold text-on-surface dark:text-zinc-50">
                    {user?.name}
                  </p>
                  <p className="truncate text-xs text-on-surface-variant dark:text-zinc-400">
                    {user?.email}
                  </p>
                  {staff && (
                    <p className="mt-1 text-xs font-semibold text-primary dark:text-blue-400">
                      {staff.roleName}
                    </p>
                  )}
                </div>
                {!posOnly && (
                  <>
                    <Link
                      href={ROUTES.profile}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface transition-[background-color,padding] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:pl-5 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <UserIcon size={15} className="opacity-60" aria-hidden />
                      My profile
                    </Link>
                    <Link
                      href={`${ROUTES.profile}#password`}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-on-surface transition-[background-color,padding] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container hover:pl-5 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <KeyRound size={15} className="opacity-60" aria-hidden />
                      Change password
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 border-t border-outline-variant px-4 py-2.5 text-sm text-error transition-[background-color,padding] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-error-container/20 hover:pl-5 dark:border-zinc-800 dark:hover:bg-red-950/30"
                >
                  <LogOut size={15} className="opacity-70" aria-hidden />
                  Log out
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </header>
  );
}
