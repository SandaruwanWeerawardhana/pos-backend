import Link from "next/link";
import { DeviceSetupWizard } from "@/components/hardware/DeviceSetupWizard";
import { ROUTES } from "@/lib/types/routes";

export default function HardwareSettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-on-surface dark:text-zinc-50">
          Hardware setup
        </h1>
        <Link
          href={ROUTES.settings.root}
          className="text-sm text-on-surface-variant hover:underline dark:text-zinc-400"
        >
          Back to settings
        </Link>
      </div>
      <DeviceSetupWizard />
    </div>
  );
}
