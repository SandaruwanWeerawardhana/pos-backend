import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/types/routes";

export default function AdminPage() {
  redirect(ROUTES.dashboard);
}
