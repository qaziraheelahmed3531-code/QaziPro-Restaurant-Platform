import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Card, Empty, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { LoyaltyWallet } from "@/contracts/types";
import { colors } from "@/ui/theme";
export default function Rewards() {
  const app = useApp(),
    [wallet, setWallet] = useState<LoyaltyWallet | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (app.session)
      void app.api
        .request<{ wallet: LoyaltyWallet }>("/loyalty", {
          token: app.session.access_token,
        })
        .then((r) => setWallet(r.data.wallet))
        .catch((e) => setError(e.message));
  }, [app.api, app.session]);
  if (!app.session)
    return (
      <Screen>
        <Empty
          title="Sign in required"
          detail="Your rewards balance is private account data."
        />
      </Screen>
    );
  if (error)
    return (
      <Screen>
        <Notice tone="error">{error}</Notice>
      </Screen>
    );
  if (!wallet)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.list}
        data={wallet.transactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Card style={styles.wallet}>
            <Text style={styles.kicker}>{wallet.programName}</Text>
            <Text style={styles.balance}>
              {wallet.balanceCoins.toLocaleString()} {wallet.coinName}
            </Text>
            <Text style={styles.value}>
              Worth Rs {wallet.balancePkr.toLocaleString()} · {wallet.tier}
            </Text>
            <Text style={styles.note}>
              {wallet.redemptionEnabled
                ? `Redemption starts at ${wallet.minimumRedeemCoins ?? 0} coins. The server applies the final amount.`
                : "Redemption is currently disabled."}
            </Text>
          </Card>
        }
        ListEmptyComponent={
          <Empty
            title="No reward activity"
            detail="Eligible completed orders will appear here."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.transaction}>
            <View>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.date}>
                {new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
            <Text
              style={[
                styles.coins,
                { color: item.coins >= 0 ? colors.green : colors.danger },
              ]}
            >
              {item.coins >= 0 ? "+" : ""}
              {item.coins}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { padding: 12 },
  wallet: { marginHorizontal: 4, backgroundColor: colors.ink },
  kicker: { color: colors.gold, fontWeight: "900" },
  balance: {
    fontSize: 30,
    color: "#fff",
    fontWeight: "900",
    marginVertical: 9,
  },
  value: { color: "#eee0d7" },
  note: { color: "#d8c9bf", fontSize: 12, lineHeight: 18, marginTop: 12 },
  transaction: {
    padding: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  description: { fontWeight: "700", color: colors.ink },
  date: { color: colors.muted, fontSize: 12, marginTop: 4 },
  coins: { fontSize: 17, fontWeight: "900" },
});
