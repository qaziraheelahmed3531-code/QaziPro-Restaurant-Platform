import { useEffect } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { roleSurface } from "@/operations/access";
import { useOperations } from "@/operations/OperationsProvider";
import { OpsButton, OpsLoading, OpsNotice, OpsScreen } from "@/operations/ui";

export default function OperationsEntry() {
  const app = useOperations(),
    router = useRouter();
  useEffect(() => {
    if (!app.ready) return;
    if (!app.session) {
      router.replace("/ops/login" as never);
      return;
    }
    if (!app.access) return;
    const surface = roleSurface(app.access.role);
    if (surface === "admin") router.replace("/ops/admin" as never);
    else if (surface === "waiter") router.replace("/ops/waiter" as never);
    else if (surface === "rider") router.replace("/ops/rider" as never);
  }, [app.access, app.ready, app.session, router]);
  return (
    <OpsScreen>
      {!app.ready || app.busy ? (
        <OpsLoading label="Verifying staff, restaurant and mobile access…" />
      ) : app.error ? (
        <>
          <OpsNotice tone="error">{app.error}</OpsNotice>
          <OpsButton
            title="Retry access check"
            onPress={() => void app.refreshAccess()}
          />
          <OpsButton
            tone="secondary"
            title="Sign out"
            onPress={() => void app.signOut()}
          />
        </>
      ) : app.access && roleSurface(app.access.role) === "unsupported" ? (
        <OpsNotice tone="error">
          This staff role does not have a mobile operations surface.
        </OpsNotice>
      ) : (
        <Text />
      )}
    </OpsScreen>
  );
}
