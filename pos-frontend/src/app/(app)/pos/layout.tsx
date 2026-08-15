import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { RequireAuth } from "@/components/shell/require-auth";

export default function PosLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RequireAuth>
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden">
        <OfflineBanner />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </RequireAuth>
  );
}
