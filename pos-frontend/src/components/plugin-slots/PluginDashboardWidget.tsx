"use client";

import { usePlugin } from "@/lib/hooks/use-plugin";

export function PluginDashboardWidget() {
  const { active } = usePlugin();
  if (!active?.DashboardWidget) return null;

  const DashboardWidgetComponent = active.DashboardWidget;
  return <DashboardWidgetComponent />;
}
