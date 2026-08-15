"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_TIMEOUT_MS = 4000;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: "border-secondary dark:border-blue-400",
  success: "border-on-tertiary-container dark:border-green-400",
  warning: "border-amber-500 dark:border-amber-400",
  error: "border-error dark:border-red-400",
};

const VARIANT_ICONS: Record<ToastVariant, ReactNode> = {
  info: <Info size={16} className="text-secondary dark:text-blue-400" />,
  success: (
    <CheckCircle2
      size={16}
      className="text-on-tertiary-container dark:text-green-400"
    />
  ),
  warning: (
    <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
  ),
  error: <XCircle size={16} className="text-error dark:text-red-400" />,
};

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, variant }]);
      const timer = setTimeout(() => {
        timers.current.delete(id);
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, TOAST_TIMEOUT_MS);
      timers.current.set(id, timer);
    },
    [],
  );

  // Auto-dismiss timers outlive the component if the tree unmounts with
  // toasts still on screen; clear them so nothing fires into a dead tree.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* aria-live so screen readers announce toasts; "polite" avoids
          interrupting whatever the user is currently reading. Errors are
          rendered with role="alert" for immediate announcement. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 top-4 z-[200] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            className={`animate-slide-in-right pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border-l-4 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface shadow-card transition-shadow duration-[var(--duration-base)] hover:shadow-popover dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-black/40 ${
              VARIANT_CLASSES[toast.variant]
            }`}
          >
            <span className="mt-0.5 shrink-0">{VARIANT_ICONS[toast.variant]}</span>
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-on-surface-variant transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:rotate-90 hover:bg-surface-container hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
