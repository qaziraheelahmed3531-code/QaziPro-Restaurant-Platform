import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import {
  Button,
  Card,
  Empty,
  Field,
  Loading,
  Notice,
  Screen,
} from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { Address } from "@/contracts/types";
import { colors } from "@/ui/theme";

export default function Addresses() {
  const app = useApp(),
    [addresses, setAddresses] = useState<Address[]>([]),
    [loading, setLoading] = useState(true),
    [editing, setEditing] = useState<Address | null>(null),
    [label, setLabel] = useState<"home" | "work" | "other">("home"),
    [line, setLine] = useState(""),
    [areaId, setAreaId] = useState(""),
    [latitude, setLatitude] = useState<number | null>(null),
    [longitude, setLongitude] = useState<number | null>(null),
    [message, setMessage] = useState("");
  const token = app.session?.access_token;
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await app.api.request<{ addresses: Address[] }>(
        "/addresses",
        { token },
      );
      setAddresses(result.data.addresses);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Addresses could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [app.api, token]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const locate = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      return setMessage(
        "Location permission is needed for authoritative delivery validation.",
      );
    const point = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setLatitude(point.coords.latitude);
    setLongitude(point.coords.longitude);
    try {
      const quote = await app.api.request<{ deliveryAreaId: string }>(
        "/delivery/quote",
        {
          branchId: app.branch!.id,
          query: {
            latitude: point.coords.latitude,
            longitude: point.coords.longitude,
          },
        },
      );
      setAreaId(quote.data.deliveryAreaId);
      setMessage("Location is eligible for delivery.");
    } catch (reason) {
      setAreaId("");
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Delivery could not be validated.",
      );
    }
  };
  const reset = () => {
    setEditing(null);
    setLabel("home");
    setLine("");
    setAreaId("");
    setLatitude(null);
    setLongitude(null);
  };
  const edit = (address: Address) => {
    setEditing(address);
    setLabel(address.label);
    setLine(address.addressLine1);
    setAreaId(address.deliveryAreaId);
    setLatitude(address.coordinates?.latitude ?? null);
    setLongitude(address.coordinates?.longitude ?? null);
  };
  const save = async () => {
    if (
      !token ||
      !areaId ||
      latitude === null ||
      longitude === null ||
      !line.trim()
    )
      return setMessage("Enter the address and validate its location first.");
    try {
      const body = {
        label,
        deliveryAreaId: areaId,
        addressLine1: line.trim(),
        latitude,
        longitude,
        locationSource: "GPS",
      };
      await app.api.request(
        editing ? `/addresses/${editing.id}` : "/addresses",
        {
          method: editing ? "PATCH" : "POST",
          token,
          branchId: app.branch!.id,
          body,
        },
      );
      reset();
      setMessage("Address saved.");
      await load();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Address could not be saved.",
      );
    }
  };
  const remove = (id: string) =>
    Alert.alert("Delete address?", "This cannot be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void app.api
            .request(`/addresses/${id}`, { method: "DELETE", token })
            .then(load)
            .catch((e) => setMessage(e.message)),
      },
    ]);
  if (!token)
    return (
      <Screen>
        <Empty
          title="Sign in required"
          detail="Saved addresses are tied securely to your account."
        />
      </Screen>
    );
  if (loading && !addresses.length)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.list}
        data={addresses}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.title}>
              {editing ? "Edit address" : "Add an address"}
            </Text>
            <Field
              label="Label: home, work or other"
              value={label}
              onChangeText={(value) =>
                setLabel(value.toLowerCase() as typeof label)
              }
            />
            <Field
              label="Complete address"
              value={line}
              onChangeText={setLine}
              multiline
            />
            <Button
              kind="secondary"
              title={
                areaId
                  ? "Delivery location validated ✓"
                  : "Use and validate current location"
              }
              onPress={() => void locate()}
            />
            {message ? (
              <Notice
                tone={
                  message.includes("saved") || message.includes("eligible")
                    ? "success"
                    : "error"
                }
              >
                {message}
              </Notice>
            ) : null}
            <Button
              title={editing ? "Update address" : "Save address"}
              onPress={() => void save()}
            />
            {editing ? (
              <Button kind="secondary" title="Cancel editing" onPress={reset} />
            ) : null}
            <Text style={styles.heading}>Saved addresses</Text>
          </View>
        }
        ListEmptyComponent={
          <Empty
            title="No saved addresses"
            detail="Add one after the server validates its delivery location."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>
              {item.label.toUpperCase()} {item.isDefault ? "· DEFAULT" : ""}
            </Text>
            <Text style={styles.copy}>{item.addressLine1}</Text>
            <View style={styles.actions}>
              <Button
                kind="secondary"
                title="Edit"
                onPress={() => edit(item)}
              />
              {!item.isDefault ? (
                <Button
                  kind="secondary"
                  title="Set default"
                  onPress={() =>
                    void app.api
                      .request(`/addresses/${item.id}/default`, {
                        method: "POST",
                        token,
                      })
                      .then(load)
                      .catch((e) => setMessage(e.message))
                  }
                />
              ) : null}
              <Button
                kind="danger"
                title="Delete"
                onPress={() => remove(item.id)}
              />
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingBottom: 30 },
  form: { padding: 18, gap: 12 },
  title: { fontSize: 25, fontWeight: "900", color: colors.ink },
  heading: { fontSize: 20, fontWeight: "900", marginTop: 12 },
  name: { fontWeight: "900", color: colors.primary },
  copy: { color: colors.muted, marginVertical: 8 },
  actions: { gap: 7 },
});
