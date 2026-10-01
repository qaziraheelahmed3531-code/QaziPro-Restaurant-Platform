import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { Banknote, LogOut, MapPin } from "lucide-react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { roleSurface } from "@/operations/access";
import { useOperations } from "@/operations/OperationsProvider";
import {
  OpsButton,
  OpsCard,
  OpsEmpty,
  OpsField,
  OpsHeader,
  OpsLoading,
  OpsMetric,
  OpsNotice,
  OpsScreen,
  OpsSection,
  OpsStatus,
  opsColors,
  opsStyles,
} from "@/operations/ui";
import type { RiderOrder } from "@/operations/types";

type Dashboard = {
  enabled: boolean;
  availableOrders: RiderOrder[];
  activeOrders: RiderOrder[];
  todayDelivered: number;
  todayCash: number;
};
const empty: Dashboard = {
  enabled: true,
  availableOrders: [],
  activeOrders: [],
  todayDelivered: 0,
  todayCash: 0,
};
const money = (value: number) =>
  `Rs ${Math.round(value || 0).toLocaleString("en-PK")}`;

export default function RiderMobile() {
  const app = useOperations(),
    router = useRouter();
  const [transitioning, setTransitioning] = useState(false);
  const [data, setData] = useState<Dashboard>(empty),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [problem, setProblem] = useState<RiderOrder | null>(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    if (
      app.ready &&
      (!app.session || !app.access || roleSurface(app.access.role) !== "rider")
    )
      router.replace("/ops" as never);
  }, [app.access, app.ready, app.session, router]);
  const load = useCallback(async () => {
    if (!app.branch) return;
    setLoading(true);
    const result = await supabase.rpc("rider_dashboard", {
      p_branch_id: app.branch.id,
    });
    if (result.error)
      setMessage(
        "Assignments could not be refreshed. Cached active work remains visible.",
      );
    else {
      setData((result.data ?? empty) as Dashboard);
      setMessage("");
      await AsyncStorage.setItem(
        `qazipro:rider-dashboard:${app.branch.id}`,
        JSON.stringify(result.data ?? empty),
      );
    }
    setLoading(false);
  }, [app.branch]);
  useEffect(() => {
    if (!app.branch) return;
    void AsyncStorage.getItem(`qazipro:rider-dashboard:${app.branch.id}`).then(
      (value) => {
        if (value)
          try {
            setData(JSON.parse(value) as Dashboard);
          } catch {}
      },
    );
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [app.branch, app.revision, load]);
  const operationId = async (orderId: string, action: string) => {
    const key = `qazipro:rider-op:${orderId}:${action}`;
    let id = await AsyncStorage.getItem(key);
    if (!id) {
      id = Crypto.randomUUID();
      await AsyncStorage.setItem(key, id);
    }
    return { id, key };
  };
  const transition = async (
    order: RiderOrder,
    action: "ACCEPT" | "COMPLETE" | "PROBLEM",
    options?: { cash?: boolean; reason?: string },
  ) => {
    if (transitioning || app.connection === "OFFLINE") {
      setMessage(
        "You're offline. Delivery status was not changed; reconnect before confirming it.",
      );
      return;
    }
    setTransitioning(true);
    setMessage(
      action === "ACCEPT"
        ? "Accepting delivery…"
        : action === "COMPLETE"
          ? "Confirming delivery…"
          : "Reporting problem…",
    );
    const operation = await operationId(order.id, action);
    const result = await supabase.rpc("mobile_rider_transition", {
      p_operation_id: operation.id,
      p_order_id: order.id,
      p_action: action,
      p_cash_received: options?.cash ?? false,
      p_reason: options?.reason ?? null,
    });
    if (result.error)
      setMessage(
        "The delivery changed or could not be confirmed. Refresh before retrying.",
      );
    else {
      await AsyncStorage.removeItem(operation.key);
      setMessage(
        action === "COMPLETE"
          ? "Delivery completed."
          : action === "PROBLEM"
            ? "Problem reported to the restaurant."
            : "Delivery accepted. Customer details are now active.",
      );
      setProblem(null);
      setReason("");
      void load();
    }
    setTransitioning(false);
  };
  const shareLocation = async (order: RiderOrder) => {
    if (!app.access || !app.branch) return;
    if (app.connection === "OFFLINE") {
      setMessage(
        "Location sharing requires a connection. Your location was not stored.",
      );
      return;
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setMessage(
        "Location permission was not granted. You can still call the restaurant.",
      );
      return;
    }
    const reading = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const payload = {
      p_order_id: order.id,
      p_latitude: reading.coords.latitude,
      p_longitude: reading.coords.longitude,
      p_accuracy_m: reading.coords.accuracy,
      p_heading: reading.coords.heading,
    };
    const result = await supabase.rpc("publish_rider_location", payload);
    setMessage(
      result.error
        ? "Location could not be shared. Try again when the signal improves."
        : "Location shared with the active delivery.",
    );
  };
  const navigate = async (order: RiderOrder) => {
    const destination =
      order.latitude != null && order.longitude != null
        ? `${order.latitude},${order.longitude}`
        : encodeURIComponent(order.delivery_address);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
    if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    else setMessage("Maps could not be opened on this device.");
  };
  if (!app.access || !app.branch)
    return (
      <OpsScreen>
        <OpsLoading />
      </OpsScreen>
    );
  const active = data.activeOrders ?? [],
    available = data.availableOrders ?? [];
  return (
    <OpsScreen>
      <OpsHeader
        title="Rider"
        subtitle={
          active.length
            ? "Active delivery in progress"
            : "Ready for the next assignment"
        }
        action={
          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => void app.signOut()}
          >
            <LogOut color={opsColors.muted} size={22} />
          </Pressable>
        }
      />
      {message ? (
        <OpsNotice
          tone={
            /not|could not|offline|changed/i.test(message) ? "error" : "success"
          }
        >
          {message}
        </OpsNotice>
      ) : null}
      {!data.enabled ? (
        <OpsNotice tone="error">
          Rider operations are disabled for this restaurant.
        </OpsNotice>
      ) : loading ? (
        <OpsLoading label="Refreshing delivery assignments…" />
      ) : (
        <>
          <View
            style={[opsStyles.split, { paddingHorizontal: 10, paddingTop: 10 }]}
          >
            <OpsMetric
              label="Delivered today"
              value={String(data.todayDelivered ?? 0)}
            />
            <OpsMetric
              label="COD collected"
              value={money(data.todayCash ?? 0)}
            />
          </View>
          <OpsSection
            title="Active now"
            detail="Customer information is limited to active work"
          />
          {active.length ? (
            active.map((order) => (
              <DeliveryCard
                key={order.id}
                order={order}
                active
                onNavigate={() => void navigate(order)}
                onCall={() =>
                  void Linking.openURL(
                    `tel:${order.customer_phone.replace(/[^+\d]/g, "")}`,
                  )
                }
                onLocation={() => void shareLocation(order)}
                onComplete={() =>
                  void transition(order, "COMPLETE", {
                    cash:
                      order.payment_method === "CASH_ON_DELIVERY" &&
                      order.payment_status !== "PAID",
                  })
                }
                onProblem={() => setProblem(order)}
              />
            ))
          ) : (
            <OpsEmpty
              title="No active delivery"
              detail="Accept a ready assignment when you are able to leave the restaurant."
            />
          )}
          <OpsSection
            title="Ready for pickup"
            detail="Assignments are claimed atomically"
          />
          {available.length ? (
            available.map((order) => (
              <DeliveryCard
                key={order.id}
                order={order}
                onNavigate={() => void navigate(order)}
                onCall={() => undefined}
                onLocation={() => undefined}
                onComplete={() => void transition(order, "ACCEPT")}
                onProblem={() => undefined}
              />
            ))
          ) : (
            <OpsEmpty
              title="No ready assignments"
              detail="New ready deliveries will appear automatically."
            />
          )}
        </>
      )}
      <Modal
        visible={Boolean(problem)}
        transparent
        animationType="fade"
        onRequestClose={() => setProblem(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#0008",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: opsColors.canvas,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingVertical: 18,
            }}
          >
            <OpsSection
              title="Report delivery problem"
              detail={problem?.order_number}
            />
            <View style={{ padding: 16, gap: 10 }}>
              <OpsField
                label="What happened?"
                value={reason}
                onChangeText={setReason}
                multiline
                maxLength={240}
                placeholder="Customer unreachable, wrong address, refused…"
              />
              <OpsButton
                tone="danger"
                title="Report problem"
                disabled={reason.trim().length < 2 || transitioning}
                onPress={() => {
                  if (problem) void transition(problem, "PROBLEM", { reason });
                }}
              />
              <OpsButton
                tone="secondary"
                title="Cancel"
                onPress={() => setProblem(null)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </OpsScreen>
  );
}

function DeliveryCard({
  order,
  active,
  onNavigate,
  onCall,
  onLocation,
  onComplete,
  onProblem,
}: {
  order: RiderOrder;
  active?: boolean;
  onNavigate: () => void;
  onCall: () => void;
  onLocation: () => void;
  onComplete: () => void;
  onProblem: () => void;
}) {
  const cod =
    order.payment_method === "CASH_ON_DELIVERY" &&
    order.payment_status !== "PAID";
  return (
    <OpsCard>
      <View style={opsStyles.row}>
        <View style={opsStyles.grow}>
          <Text style={opsStyles.strong}>{order.order_number}</Text>
          <Text style={opsStyles.muted}>
            Token {String(order.token_number).padStart(3, "0")}
          </Text>
        </View>
        <OpsStatus value={active ? "OUT_FOR_DELIVERY" : "READY"} />
      </View>
      <View style={[opsStyles.row, { marginTop: 12 }]}>
        <MapPin color={opsColors.brand} size={20} />
        <View style={opsStyles.grow}>
          <Text style={opsStyles.strong}>{order.customer_name}</Text>
          <Text style={opsStyles.muted}>{order.delivery_address}</Text>
          {order.delivery_instructions ? (
            <Text style={opsStyles.muted}>
              Note: {order.delivery_instructions}
            </Text>
          ) : null}
        </View>
      </View>
      {cod ? (
        <View
          style={[
            opsStyles.row,
            {
              marginTop: 12,
              padding: 12,
              borderRadius: 10,
              backgroundColor: "#fff5df",
            },
          ]}
        >
          <Banknote color={opsColors.warning} size={21} />
          <Text style={[opsStyles.strong, opsStyles.grow]}>
            Collect exactly
          </Text>
          <Text style={opsStyles.strong}>{money(order.total)}</Text>
        </View>
      ) : null}
      <View style={[opsStyles.split, { marginTop: 14 }]}>
        {active ? (
          <>
            <OpsButton
              compact
              tone="secondary"
              title="Navigate"
              onPress={onNavigate}
            />
            <OpsButton compact tone="secondary" title="Call" onPress={onCall} />
            <OpsButton
              compact
              tone="secondary"
              title="Share location"
              onPress={onLocation}
            />
            <OpsButton
              compact
              title={
                cod
                  ? `Collected ${money(order.total)} · Deliver`
                  : "Mark delivered"
              }
              onPress={onComplete}
            />
            <OpsButton
              compact
              tone="danger"
              title="Problem"
              onPress={onProblem}
            />
          </>
        ) : (
          <OpsButton title="Accept & pick up" onPress={onComplete} />
        )}
      </View>
    </OpsCard>
  );
}
