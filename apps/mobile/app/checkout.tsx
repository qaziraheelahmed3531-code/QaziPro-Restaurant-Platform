import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { Button, Card, Field, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type {
  LoyaltyWallet,
  PaymentCapabilities,
  Profile,
} from "@/contracts/types";
import { cartEstimate } from "@/domain/cart";
import { MobileApiError } from "@/lib/errors";
import { colors } from "@/ui/theme";

type Mode = "DELIVERY" | "PICKUP";
export default function Checkout() {
  const app = useApp(),
    router = useRouter(),
    deliveryEnabled = app.branch?.orderingModes.includes("DELIVERY") ?? false,
    pickupEnabled = app.branch?.orderingModes.includes("PICKUP") ?? false;
  const [mode, setMode] = useState<Mode>(
      deliveryEnabled ? "DELIVERY" : "PICKUP",
    ),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [email, setEmail] = useState(app.session?.user.email ?? ""),
    [address, setAddress] = useState(""),
    [instructions, setInstructions] = useState(""),
    [areaId, setAreaId] = useState(""),
    [latitude, setLatitude] = useState<number | null>(null),
    [longitude, setLongitude] = useState<number | null>(null),
    [deliveryMessage, setDeliveryMessage] = useState(""),
    [coupon, setCoupon] = useState(app.cart.promoCode ?? ""),
    [couponMessage, setCouponMessage] = useState(""),
    [loyalty, setLoyalty] = useState<LoyaltyWallet | null>(null),
    [payments, setPayments] = useState<PaymentCapabilities | null>(null),
    [coins, setCoins] = useState(String(app.cart.loyaltyCoins || 0)),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const token = app.session?.access_token;
  useEffect(() => {
    void app.api
      .request<PaymentCapabilities>("/payments")
      .then((result) => setPayments(result.data))
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Payment methods could not be loaded.",
        ),
      );
  }, [app.api]);
  useEffect(() => {
    if (token) {
      void app.api
        .request<{ profile: Profile; email: string }>("/profile", { token })
        .then((r) => {
          setName(r.data.profile.full_name ?? "");
          setPhone(r.data.profile.phone ?? "");
          setEmail((current) => r.data.email ?? current);
        });
      void app.api
        .request<{ wallet: LoyaltyWallet }>("/loyalty", { token })
        .then((r) => setLoyalty(r.data.wallet))
        .catch(() => undefined);
    }
  }, [app.api, token]);
  const estimate = useMemo(() => cartEstimate(app.cart), [app.cart]);
  const codEnabled =
    payments?.methods.some(
      (method) => method.id === "CASH_ON_DELIVERY" && method.enabled,
    ) ?? false;
  const validateLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      return Alert.alert(
        "Location permission denied",
        "Enable location in device settings, or choose pickup.",
      );
    const point = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setLatitude(point.coords.latitude);
    setLongitude(point.coords.longitude);
    setDeliveryMessage("Validating delivery…");
    try {
      const quote = await app.api.request<{
        eligible: boolean;
        deliveryAreaId: string;
        distanceKm: number;
        deliveryFee: number;
      }>("/delivery/quote", {
        branchId: app.branch!.id,
        query: {
          latitude: point.coords.latitude,
          longitude: point.coords.longitude,
        },
      });
      setAreaId(quote.data.deliveryAreaId);
      setDeliveryMessage(
        `Delivery available · ${quote.data.distanceKm.toFixed(1)} km · estimated fee Rs ${quote.data.deliveryFee}`,
      );
    } catch (reason) {
      setAreaId("");
      setDeliveryMessage(
        reason instanceof Error
          ? reason.message
          : "Delivery could not be validated.",
      );
    }
  };
  const applyCoupon = async () => {
    try {
      const result = await app.api.request<{
        valid: boolean;
        estimatedDiscount: number;
      }>("/promotions/validate", {
        method: "POST",
        branchId: app.branch!.id,
        body: { code: coupon, subtotal: estimate },
      });
      if (!result.data.valid)
        throw new Error("This coupon is not available for your cart.");
      await app.setCoupon(coupon.toUpperCase());
      setCouponMessage(
        `Estimated saving Rs ${result.data.estimatedDiscount}. Final discount is calculated at checkout.`,
      );
    } catch (reason) {
      setCouponMessage(
        reason instanceof Error ? reason.message : "Coupon is invalid.",
      );
      await app.setCoupon(undefined);
    }
  };
  const submit = async () => {
    setError("");
    if (!codEnabled) return setError("No supported payment method is enabled.");
    if (!name.trim() || !phone.trim())
      return setError("Name and phone are required.");
    if (
      mode === "DELIVERY" &&
      (!address.trim() || !areaId || latitude === null || longitude === null)
    )
      return setError(
        "Capture a location that the server confirms is eligible for delivery.",
      );
    setSubmitting(true);
    try {
      const order = await app.placeOrder({
        branchId: app.branch!.id,
        serviceMode: mode,
        paymentMethod: "CASH_ON_DELIVERY",
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        deliveryAreaId: mode === "DELIVERY" ? areaId : undefined,
        deliveryAddress: mode === "DELIVERY" ? address.trim() : undefined,
        deliveryInstructions: instructions.trim() || undefined,
        locationSource: mode === "DELIVERY" ? "GPS" : undefined,
        latitude: mode === "DELIVERY" ? (latitude ?? undefined) : undefined,
        longitude: mode === "DELIVERY" ? (longitude ?? undefined) : undefined,
        promoCode: app.cart.promoCode,
        loyaltyCoinsToRedeem: Number(coins) || 0,
      });
      const orderNumber = String(order.orderNumber ?? order.order_number);
      router.replace(`/order/${orderNumber}?success=1`);
    } catch (reason) {
      setError(
        reason instanceof MobileApiError
          ? `${reason.message}${reason.requestId ? ` (Ref ${reason.requestId})` : ""}`
          : reason instanceof Error
            ? reason.message
            : "Order could not be placed.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text style={styles.title}>Complete your order</Text>
          <View style={styles.mode}>
            {deliveryEnabled ? (
              <Pressable
                onPress={() => setMode("DELIVERY")}
                style={[
                  styles.modeButton,
                  mode === "DELIVERY" && styles.active,
                ]}
              >
                <Text style={mode === "DELIVERY" && styles.activeText}>
                  Delivery
                </Text>
              </Pressable>
            ) : null}
            {pickupEnabled ? (
              <Pressable
                onPress={() => setMode("PICKUP")}
                style={[styles.modeButton, mode === "PICKUP" && styles.active]}
              >
                <Text style={mode === "PICKUP" && styles.activeText}>
                  Pickup
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Card style={styles.form}>
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <Field
              label="Email (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </Card>
          {mode === "DELIVERY" ? (
            <Card style={styles.form}>
              <Text style={styles.heading}>Delivery details</Text>
              <Field
                label="Complete address"
                value={address}
                onChangeText={setAddress}
                multiline
              />
              <Button
                kind="secondary"
                title={
                  latitude === null
                    ? "Use current location"
                    : "Validate location again"
                }
                onPress={() => void validateLocation()}
              />
              {deliveryMessage ? (
                <Notice tone={areaId ? "success" : "error"}>
                  {deliveryMessage}
                </Notice>
              ) : null}
              <Field
                label="Delivery instructions (optional)"
                value={instructions}
                onChangeText={setInstructions}
              />
              <Notice>
                Location lookup and routing require the staging Geoapify key.
                Pickup remains available if delivery validation is unavailable.
              </Notice>
            </Card>
          ) : null}
          <Card style={styles.form}>
            <Text style={styles.heading}>Savings</Text>
            <Field
              label="Coupon code"
              value={coupon}
              onChangeText={setCoupon}
              autoCapitalize="characters"
            />
            <Button
              kind="secondary"
              title="Validate coupon"
              disabled={!coupon.trim()}
              onPress={() => void applyCoupon()}
            />
            {couponMessage ? (
              <Text style={styles.help}>{couponMessage}</Text>
            ) : null}
            {token && loyalty?.redemptionEnabled ? (
              <>
                <Field
                  label={`${loyalty.coinName} to redeem (balance ${loyalty.balanceCoins})`}
                  value={coins}
                  onChangeText={(value) => {
                    setCoins(value);
                    void app.setLoyalty(Number(value) || 0);
                  }}
                  keyboardType="number-pad"
                />
                <Text style={styles.help}>
                  The server validates your balance and final redemption.
                </Text>
              </>
            ) : null}
          </Card>
          <Card style={styles.form}>
            <View style={styles.summary}>
              <Text>Estimated items</Text>
              <Text>Rs {estimate.toLocaleString()}</Text>
            </View>
            <View style={styles.summary}>
              <Text>Payment</Text>
              <Text style={styles.bold}>
                {payments?.methods.find(
                  (method) => method.id === "CASH_ON_DELIVERY",
                )?.label ?? "Loading payment methods…"}
              </Text>
            </View>
            <Text style={styles.help}>
              Final subtotal, discount, loyalty, tax, delivery and total come
              from the server.
            </Text>
          </Card>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            title={submitting ? "Placing order…" : "Place COD order"}
            disabled={submitting || app.cart.lines.length === 0 || !codEnabled}
            onPress={() => void submit()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 38, gap: 10 },
  title: { fontSize: 27, fontWeight: "900", color: colors.ink },
  mode: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 15,
    backgroundColor: "#eee6df",
  },
  modeButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  active: { backgroundColor: colors.primary },
  activeText: { color: "#fff", fontWeight: "900" },
  form: { marginHorizontal: 0, gap: 12 },
  heading: { fontSize: 17, fontWeight: "900" },
  help: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  summary: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: "800" },
});
