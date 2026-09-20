import { ResourceScreen } from "@/components/resource-screen";
import { requirePermission } from "@/lib/auth";

export default async function Page() {
  await requirePermission("settings.manage");
  return <ResourceScreen resource="posSections" />;
}
