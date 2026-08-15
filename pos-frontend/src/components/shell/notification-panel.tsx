"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { liveQuery } from "dexie";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Info,
  PackageX,
  RefreshCw,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshInventoryNotifications,
} from "@/lib/db/notifications";
import { formatDateTime } from "@/lib/format";
import type { AppNotification, NotificationKind } from "@/lib/types";

const KIND_ICONS: Record<NotificationKind, typeof Bell> = {
  low_stock: AlertTriangle,
  out_of_stock: PackageX,
  expiry: CalendarClock,
  expired: CalendarClock,
  sync: RefreshCw,
  system: Info,
};

const KIND_TONE: Record<NotificationKind, string> = {
  low_stock: "text-amber-600 dark:text-amber-400",
  out_of_stock: "text-error dark:text-red-400",
  expiry: "text-amber-600 dark:text-amber-400",
  expired: "text-error dark:text-red-400",
  sync: "text-secondary dark:text-blue-400",
  system: "text-on-surface-variant dark:text-zinc-400",
};

const REFRESH_INTERVAL_MS = 120_000;

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.notifications.orderBy("created_at").reverse().limit(30).toArray(),
    ).subscribe({ next: setNotifications });
    return () => subscription.unsubscribe();
  }, []);

  // Alerts are derived from inventory state rather than pushed by a server,
  // so they are re-swept on mount and on a slow timer.
  useEffect(() => {
    void refreshInventoryNotifications();
    const timer = window.setInterval(() => {
      void refreshInventoryNotifications();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="group relative flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:border-primary/40 hover:bg-surface-container hover:text-primary active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Bell
          size={15}
          className="transition-transform duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110"
        />
        {unreadCount > 0 && (
          <span className="animate-scale-in absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="animate-scale-in absolute right-0 top-10 z-[120] flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-popover dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-4 py-3 dark:border-zinc-800">
            <p className="text-sm font-semibold text-on-surface dark:text-zinc-50">
              Notifications
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-opacity duration-[var(--duration-fast)] hover:underline hover:opacity-80 dark:text-blue-400"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="animate-fade-in px-4 py-10 text-center text-sm text-on-surface-variant dark:text-zinc-400">
                Nothing needs your attention right now.
              </li>
            )}
            {notifications.map((notification) => {
              const Icon = KIND_ICONS[notification.kind];
              const body = (
                <>
                  <span
                    className={`mt-0.5 shrink-0 ${KIND_TONE[notification.kind]}`}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-on-surface dark:text-zinc-100">
                      {notification.title}
                    </span>
                    {notification.body && (
                      <span className="mt-0.5 block text-xs text-on-surface-variant dark:text-zinc-400">
                        {notification.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-on-surface-variant/60 dark:text-zinc-600">
                      {formatDateTime(notification.created_at)}
                    </span>
                  </span>
                  {!notification.read && (
                    <span
                      aria-hidden
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                    />
                  )}
                </>
              );

              const className = `flex w-full items-start gap-3 px-4 py-3 text-left transition-[background-color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-container dark:hover:bg-zinc-800 ${
                notification.read ? "opacity-70" : ""
              }`;

              return (
                <li
                  key={notification.id}
                  className="border-b border-outline-variant/50 last:border-0 dark:border-zinc-800"
                >
                  {notification.href ? (
                    <Link
                      href={notification.href}
                      onClick={() => {
                        void markNotificationRead(notification.id);
                        setOpen(false);
                      }}
                      className={className}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(notification.id)}
                      className={className}
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
