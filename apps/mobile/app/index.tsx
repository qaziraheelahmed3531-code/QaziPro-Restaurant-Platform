import { useEffect } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { Button, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";

export default function Bootstrap() {
  const app = useApp(),
    router = useRouter();
  useEffect(() => {
    if (
      app.ready &&
      app.bootstrap &&
      !app.bootstrap.maintenance.enabled &&
      !app.error
    )
      router.replace(app.branch ? "/(tabs)" : "/branch");
  }, [app.bootstrap, app.branch, app.error, app.ready, router]);
  return (
    <Screen>
      {!app.ready || app.busy ? (
        <Loading label="Opening your restaurant…" />
      ) : app.error ? (
        <>
          <Notice tone="error">{app.error}</Notice>
          <Button title="Try again" onPress={() => void app.reload()} />
        </>
      ) : app.bootstrap?.maintenance.enabled ? (
        <Notice>
          {app.bootstrap.maintenance.message ||
            "This restaurant app is temporarily under maintenance."}
        </Notice>
      ) : (
        <Text />
      )}
    </Screen>
  );
}
