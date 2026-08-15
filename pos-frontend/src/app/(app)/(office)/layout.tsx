"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ROUTES } from "@/lib/types/routes";
import { RequireAuth } from "@/components/shell/require-auth";
import { RequireOffice } from "@/components/shell/require-office";
import {
  SIDEBAR_CONTENT_OFFSET_CLASS,
  SIDEBAR_WIDTH_CLASS,
} from "@/lib/layout";
import {
  BarChart2,
  Barcode,
  Bell,
  Bookmark,
  Box,
  Boxes,
  Briefcase,
  ChevronDown,
  Contact,
  Copy,
  CreditCard,
  DollarSign,
  FilePlus,
  Files,
  Folder,
  KeyRound,
  LayoutDashboard,
  Monitor,
  PackagePlus,
  Quote,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  UserCog,
  Users,
  XCircle,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Monitor;
  /* Rendered as a collapsible section instead of a plain link. */
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type SidebarOpenSetter = Dispatch<SetStateAction<boolean>>;
type OpenSectionsSetter = Dispatch<SetStateAction<Record<string, boolean>>>;

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Menu",
    items: [
      { href: ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
      {
        href: ROUTES.sales.root,
        label: "Sales",
        icon: DollarSign,
        children: [
          { href: ROUTES.pos.root, label: "Create Sale", icon: FilePlus },
          { href: ROUTES.sales.root, label: "All Sales", icon: Files },
        ],
      },
      {
        href: ROUTES.products,
        label: "Products",
        icon: PackagePlus,
        children: [
          { href: ROUTES.productsNew, label: "Create product", icon: FilePlus },
          { href: ROUTES.products, label: "All Products", icon: Files },
          {
            href: ROUTES.catalogue.printLabels,
            label: "Print Labels",
            icon: Barcode,
          },
          {
            href: ROUTES.catalogue.categories,
            label: "Categories",
            icon: Copy,
          },
          { href: ROUTES.catalogue.brands, label: "Brand", icon: Bookmark },
          { href: ROUTES.catalogue.units, label: "Units", icon: Quote },
          { href: ROUTES.catalogue.batches, label: "Batches", icon: Boxes },
        ],
      },
      { href: ROUTES.discounts, label: "Promotions", icon: Tag },
      {
        href: ROUTES.purchases.root,
        label: "Purchases",
        icon: DollarSign,
        children: [
          { href: ROUTES.purchases.new, label: "Create Purchase", icon: FilePlus },
          { href: ROUTES.purchases.root, label: "All Purchases", icon: Files },
        ],
      },
      {
        href: ROUTES.people.root,
        label: "People",
        icon: Users,
        children: [
          { href: ROUTES.people.root, label: "Customers", icon: ShieldCheck },
          { href: ROUTES.people.new, label: "Create Customer", icon: FilePlus },
          { href: ROUTES.suppliers, label: "Suppliers", icon: Shield },
          { href: ROUTES.suppliersNew, label: "Create Supplier", icon: FilePlus },
        ],
      },
      {
        href: ROUTES.store.root,
        label: "Store",
        icon: Store,
        children: [
          { href: ROUTES.inventory.root, label: "Inventory", icon: Boxes },
          { href: ROUTES.inventory.alerts, label: "Stock alerts", icon: Bell },
        ],
      },
      {
        href: ROUTES.users.root,
        label: "User Management",
        icon: ShieldCheck,
        children: [
          { href: ROUTES.users.root, label: "Users", icon: Users },
          {
            href: ROUTES.users.permissions,
            label: "Group Permissions",
            icon: KeyRound,
          },
        ],
      },
      { href: ROUTES.profile, label: "My profile", icon: UserCog },
      {
        href: ROUTES.reports,
        label: "Reports",
        icon: BarChart2,
        children: [
          { href: ROUTES.reports3d, label: "3D Sales Dashboard", icon: Box },
          {
            href: `${ROUTES.reports}?report=sales`,
            label: "Payments",
            icon: CreditCard,
            children: [
              { href: ROUTES.reportsPaymentPurchases, label: "Purchases", icon: ShoppingCart },
              { href: ROUTES.reportsPaymentSales, label: "Sales", icon: ShoppingBag },   
            ],
          },
          { href: `${ROUTES.reports}?report=profit`, label: "Profit and Loss", icon: Briefcase },
          { href: `${ROUTES.reports}?report=sales`, label: "Sales Report", icon: Receipt },
          { href: `${ROUTES.reports}?report=suppliers`, label: "Suppliers Report", icon: Truck },  
          { href: `${ROUTES.reports}?report=customers`, label: "Customers Report", icon: Contact },
          { href: `${ROUTES.reports}?report=sales`, label: "Sales by Category", icon: Folder },
          { href: `${ROUTES.reports}?report=sales`, label: "Sales by Brand", icon: Bookmark },
          { href: `${ROUTES.reports}?report=sales`, label: "Error Logs", icon: XCircle },
    
        ],
      },
      { href: ROUTES.settings.root, label: "Settings", icon: Settings },
    ],
  },
];


function flattenItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) =>
    item.children ? [item, ...flattenItems(item.children)] : [item],
  );
}

function findActiveHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const matches = flattenItems(NAV_GROUPS.flatMap((group) => group.items))
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  return (
    matches.reduce(
      (longest, href) => (href.length > longest.length ? href : longest),
      "",
    ) || null
  );
}

/* Indentation grows with nesting depth (0 = top-level, 2 = grandchild — e.g. Reports > Payments > Sales). */
const CHILD_PADDING_BY_DEPTH: Record<number, string> = {
  1: "pl-8",
  2: "pl-12",
};

function NavItemLink({
  item,
  active,
  onNavigate,
  depth = 0,
}: Readonly<{
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
  depth?: number;
}>) {
  const Icon = item.icon;
  const isChild = depth > 0;
  const activeClasses = isChild
    ? "bg-surface-container font-medium text-primary dark:bg-zinc-800 dark:text-blue-400"
    : "bg-gradient-to-r from-primary to-secondary text-on-primary shadow-sm";
  const inactiveClasses =
    "text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container hover:text-on-surface dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={`group flex items-center gap-2.5 rounded-lg text-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        isChild ? `min-h-9 py-1 ${CHILD_PADDING_BY_DEPTH[depth]} pr-3` : "min-h-10 px-3 font-medium"
      } ${active ? activeClasses : inactiveClasses}`}
    >
      <Icon
        size={isChild ? 15 : 16}
        aria-hidden
        className={`transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110 ${
          active && !isChild ? "opacity-90" : "opacity-70"
        }`}
      />
      {item.label}
    </Link>
  );
}

function ParentNavItem({
  item,
  activeHref,
  openSections,
  setOpenSections,
  onNavigate,
  depth = 1,
}: Readonly<{
  item: NavItem;
  activeHref: string | null;
  openSections: Record<string, boolean>;
  setOpenSections: OpenSectionsSetter;
  onNavigate: () => void;
  depth?: number;
}>) {
  const children = item.children ?? [];
  const Icon = item.icon;
  const sectionActive = children.some((child) => activeHref === child.href);
  const open = openSections[item.label] ?? sectionActive;
  const isNested = depth > 1;

  function handleToggle() {
    setOpenSections((sections) => ({
      ...sections,
      [item.label]: !open,
    }));
  }

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={handleToggle}
        className={`group flex w-full items-center gap-2.5 rounded-lg text-sm transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          isNested ? `min-h-9 py-1 ${CHILD_PADDING_BY_DEPTH[depth - 1]} pr-3` : "min-h-10 px-3 font-medium"
        } ${
          sectionActive
            ? "bg-gradient-to-r from-primary to-secondary text-on-primary shadow-sm"
            : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        }`}
      >
        <Icon
          size={isNested ? 15 : 16}
          aria-hidden
          className={`transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-spring)] group-hover:scale-110 ${
            sectionActive ? "opacity-90" : "opacity-60"
          }`}
        />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
            open ? "rotate-180" : ""
          } ${sectionActive ? "opacity-90" : "opacity-60"}`}
        />
      </button>

      {open && (
        <div className="animate-fade-in flex flex-col gap-0.5 rounded-lg bg-surface-container-low py-1 dark:bg-zinc-900">
          {children.map((child) =>
            child.children ? (
              <ParentNavItem
                key={child.label}
                item={child}
                activeHref={activeHref}
                openSections={openSections}
                setOpenSections={setOpenSections}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ) : (
              <NavItemLink
                key={child.label}
                item={child}
                active={activeHref === child.href}
                onNavigate={onNavigate}
                depth={depth}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function NavGroupSection({
  group,
  activeHref,
  openSections,
  setOpenSections,
  setSidebarOpen,
}: Readonly<{
  group: NavGroup;
  activeHref: string | null;
  openSections: Record<string, boolean>;
  setOpenSections: OpenSectionsSetter;
  setSidebarOpen: SidebarOpenSetter;
}>) {
  function handleNavigate() {
    setSidebarOpen(false);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant/50 dark:text-zinc-600">
        {group.label}
      </p>
      {group.items.map((item) =>
        item.children ? (
          <ParentNavItem
            key={item.label}
            item={item}
            activeHref={activeHref}
            openSections={openSections}
            setOpenSections={setOpenSections}
            onNavigate={handleNavigate}
          />
        ) : (
          <NavItemLink
            key={item.href}
            item={item}
            active={activeHref === item.href}
            onNavigate={handleNavigate}
          />
        ),
      )}
    </div>
  );
}

export default function OfficeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Only holds sections the user has explicitly toggled; anything absent falls
  // back to "open when it contains the active route".
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const activeHref = findActiveHref(pathname);

  useEffect(() => {
    const toggleSidebar = () => setSidebarOpen((open) => !open);
    window.addEventListener("swiftpos:toggle-sidebar", toggleSidebar);
    return () =>
      window.removeEventListener("swiftpos:toggle-sidebar", toggleSidebar);
  }, []);

  return (
    <RequireAuth>
      <RequireOffice>
      <div className={`flex h-[calc(100dvh-3.5rem)] min-h-0 flex-1 overflow-hidden ${SIDEBAR_CONTENT_OFFSET_CLASS}`}>
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="animate-fade-in fixed inset-0 z-[75] bg-black/30 md:hidden"
          />
        )}

        <aside
          aria-label="Main navigation"
          className={`fixed bottom-0 left-0 top-0 z-[80] flex h-dvh ${SIDEBAR_WIDTH_CLASS} shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest transition-transform duration-[var(--duration-slow)] ease-[var(--ease-decelerate)] md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-outline-variant px-4 dark:border-zinc-800">
            <span className="flex h-7 w-7 select-none items-center justify-center rounded-lg bg-gradient-to-r from-primary to-secondary">
              <Image src="/logo.png" alt="PSI POS" width={28} height={28} className="rounded-lg" />
            </span>
            <span className="font-display text-sm font-semibold text-on-surface dark:text-zinc-100">
              PSI POS
            </span>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {NAV_GROUPS.map((group) => (
              <NavGroupSection
                key={group.label}
                group={group}
                activeHref={activeHref}
                openSections={openSections}
                setOpenSections={setOpenSections}
                setSidebarOpen={setSidebarOpen}
              />
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto scroll-smooth bg-surface dark:bg-zinc-950">
          <div
            key={pathname}
            className={`animate-fade-in-up mx-auto ${
              pathname === ROUTES.products ||
              pathname === ROUTES.people.root ||
              pathname === ROUTES.suppliers
                ? "max-w-full py-4 sm:py-6"
                : "max-w-6xl p-4 sm:p-6"
            }`}
          >
            {children}
          </div>
        </main>
      </div>
      </RequireOffice>
    </RequireAuth>
  );
}
