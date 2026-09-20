import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { registerPush, unregisterPush } from "@/lib/notifications";
import { colors } from "@/ui/theme";

export default function Account() {
  const app = useApp(),
    router = useRouter();
  if (!app.session)
    return (
      <Screen>
        <View style={styles.guest}>
          <Text style={styles.title}>Your account</Text>
          <Text style={styles.copy}>
            Sign in to sync addresses, favourites, rewards, orders and devices.
          </Text>
          <Button
            title="Sign in or create account"
            onPress={() => router.push("/auth")}
          />
        </View>
      </Screen>
    );
  const token = app.session.access_token;
  const push = async () => {
    try {
      await registerPush(app.api, token);
      Alert.alert(
        "Notifications enabled",
        "This device is registered for secure order updates.",
      );
    } catch (reason) {
      Alert.alert(
        "Push unavailable",
        reason instanceof Error ? reason.message : "Try again later.",
      );
    }
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your account</Text>
        <Text style={styles.copy}>{app.session.user.email}</Text>
        <Card style={styles.menu}>
          <Button
            kind="secondary"
            title="Profile"
            onPress={() => router.push("/profile")}
          />
          <Button
            kind="secondary"
            title="Delivery addresses"
            onPress={() => router.push("/addresses")}
          />
          <Button
            kind="secondary"
            title="Favourites"
            onPress={() => router.push("/favourites")}
          />
          <Button
            kind="secondary"
            title="Rewards wallet"
            onPress={() => router.push("/rewards")}
          />
        </Card>
        <Card style={styles.menu}>
          <Text style={styles.heading}>Order notifications</Text>
          <Notice>
            Notification access is requested only when you enable it. Provider
            delivery remains disabled until FCM/APNs credentials are configured.
          </Notice>
          <Button title="Enable this device" onPress={() => void push()} />
          <Button
            kind="secondary"
            title="Remove this device"
            onPress={() =>
              void unregisterPush(app.api, token)
                .then(() =>
                  Alert.alert(
                    "Removed",
                    "This device will no longer receive order pushes.",
                  ),
                )
                .catch((reason) =>
                  Alert.alert("Could not remove", reason.message),
                )
            }
          />
        </Card>
        <Button
          kind="danger"
          title="Sign out everywhere"
          onPress={() =>
            Alert.alert(
              "Sign out?",
              "This revokes the current server session.",
              [
                { text: "Stay", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => void app.logout(),
                },
              ],
            )
          }
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 18, gap: 8 },
  guest: { padding: 26, gap: 15 },
  title: { fontSize: 28, fontWeight: "900", color: colors.ink },
  copy: { color: colors.muted, lineHeight: 21 },
  menu: { marginHorizontal: 0, gap: 10 },
  heading: { fontSize: 17, fontWeight: "900" },
});
