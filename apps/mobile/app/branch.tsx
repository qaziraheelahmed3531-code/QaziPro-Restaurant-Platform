import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Empty, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { colors } from "@/ui/theme";

export default function BranchScreen() {
  const { bootstrap, branch, cart, selectBranch } = useApp(),
    router = useRouter();
  const choose = (next: NonNullable<typeof bootstrap>["branches"][number]) => {
    const apply = () =>
      void selectBranch(next).then(() => router.replace("/(tabs)"));
    if (branch && branch.id !== next.id && cart.lines.length)
      Alert.alert(
        "Change branch?",
        "Your current cart will be cleared because prices and availability can differ by branch.",
        [
          { text: "Keep current", style: "cancel" },
          { text: "Change and clear", style: "destructive", onPress: apply },
        ],
      );
    else apply();
  };
  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.list}
        data={bootstrap?.branches ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Where are you ordering from?</Text>
            <Text style={styles.copy}>
              Only verified branches for {bootstrap?.displayName} are shown.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="No branches available"
            detail="Ordering is temporarily unavailable. Please try again later."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.copy}>{item.address || item.city}</Text>
            <Text
              style={[
                styles.status,
                {
                  color:
                    item.isOpen && !item.temporarilyClosed
                      ? colors.green
                      : colors.danger,
                },
              ]}
            >
              {item.isOpen && !item.temporarilyClosed
                ? `Open · ${item.todayHoursLabel}`
                : "Closed"}
            </Text>
            <Button
              title={branch?.id === item.id ? "Selected" : "Select branch"}
              disabled={branch?.id === item.id}
              onPress={() => choose(item)}
            />
          </Card>
        )}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingVertical: 18 },
  header: { padding: 22, gap: 8 },
  title: { fontSize: 29, fontWeight: "900", color: colors.ink },
  copy: { color: colors.muted, lineHeight: 21 },
  name: { fontSize: 19, fontWeight: "800", color: colors.ink, marginBottom: 5 },
  status: { fontWeight: "800", marginVertical: 12 },
});
