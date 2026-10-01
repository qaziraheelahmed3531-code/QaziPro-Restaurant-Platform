import { forwardRef, useState, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { Bell, Building2, CloudOff, RefreshCw } from "lucide-react-native";
import { useOperations } from "./OperationsProvider";
import type { ConnectionState } from "./types";
import { registerStaffPush } from "@/lib/notifications";
import { env } from "@/config/env";

export const opsColors = {
  canvas: "#f6f5f3",
  paper: "#ffffff",
  ink: "#211d1a",
  muted: "#726b66",
  line: "#dedad5",
  brand: "#b42318",
  danger: "#b42318",
  success: "#16803a",
  warning: "#ad6800",
  info: "#2563eb",
};

export function OpsScreen({
  children,
  scroll = true,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );
  return <SafeAreaView style={styles.screen}>{body}</SafeAreaView>;
}

export function OpsHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { access, branch, connection, queued } = useOperations();
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        {access?.logoUrl ? (
          <Image source={{ uri: access.logoUrl }} style={styles.logo} />
        ) : (
          <View
            style={[
              styles.logoFallback,
              { backgroundColor: access?.primaryColor ?? opsColors.brand },
            ]}
          >
            <Building2 color="#fff" size={20} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>
            {access?.businessName ?? "QAZIPRO OPERATIONS"}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {env.pushEnabled && access && branch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enable staff notifications"
            onPress={() =>
              void registerStaffPush(access, branch)
                .then(() =>
                  Alert.alert(
                    "Notifications enabled",
                    "Operational alerts will use this device for the selected branch.",
                  ),
                )
                .catch((error) =>
                  Alert.alert(
                    "Notifications unavailable",
                    error instanceof Error ? error.message : "Try again.",
                  ),
                )
            }
          >
            <Bell color={opsColors.muted} size={21} />
          </Pressable>
        ) : null}
        {action}
      </View>
      <View style={styles.contextRow}>
        <ConnectionPill state={connection} queued={queued} />
        <Text numberOfLines={1} style={styles.branch}>
          {branch?.name}
          {branch?.city ? ` · ${branch.city}` : ""}
        </Text>
      </View>
    </View>
  );
}

export function ConnectionPill({
  state,
  queued,
}: {
  state: ConnectionState;
  queued?: number;
}) {
  const tone =
    state === "ONLINE"
      ? opsColors.success
      : state === "OFFLINE"
        ? opsColors.danger
        : opsColors.warning;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Connection ${state.toLowerCase()}`}
      style={[styles.pill, { borderColor: tone }]}
    >
      {state === "OFFLINE" ? (
        <CloudOff color={tone} size={13} />
      ) : (
        <RefreshCw color={tone} size={13} />
      )}
      <Text style={[styles.pillText, { color: tone }]}>
        {state.replaceAll("_", " ")}
        {queued ? ` · ${queued}` : ""}
      </Text>
    </View>
  );
}

export function OpsButton({
  title,
  onPress,
  disabled,
  tone = "primary",
  compact = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  compact?: boolean;
  accessibilityLabel?: string;
}) {
  const [pressed, setPressed] = useState(false),
    reduced = useReducedMotion();
  const animated = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: withTiming(pressed && !reduced ? 0.98 : 1, {
            duration: pressed ? 90 : 120,
          }),
        },
      ],
    }),
    [pressed, reduced],
  );
  const press = () => {
    void Haptics.selectionAsync();
    onPress();
  };
  return (
    <Animated.View style={animated}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        disabled={disabled}
        onPress={press}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          styles.button,
          compact && styles.buttonCompact,
          tone === "primary"
            ? styles.buttonPrimary
            : tone === "danger"
              ? styles.buttonDanger
              : styles.buttonSecondary,
          disabled && styles.disabled,
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            tone !== "primary" && styles.buttonTextDark,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function OpsCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function OpsSection({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.subtitle}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}
export function OpsMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <OpsCard style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.subtitle}>{detail}</Text> : null}
    </OpsCard>
  );
}
export function OpsStatus({ value }: { value: string }) {
  const normalized = value.toUpperCase(),
    color = ["DELIVERED", "COMPLETED", "READY", "PAID"].includes(normalized)
      ? opsColors.success
      : ["CANCELLED", "FAILED", "PROBLEM"].includes(normalized)
        ? opsColors.danger
        : ["PREPARING", "ACKNOWLEDGED", "OUT_FOR_DELIVERY"].includes(normalized)
          ? opsColors.warning
          : opsColors.info;
  return (
    <View style={[styles.status, { backgroundColor: `${color}15` }]}>
      <Text style={[styles.statusText, { color }]}>
        {value.replaceAll("_", " ")}
      </Text>
    </View>
  );
}
export const OpsField = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string }
>(function OpsField({ label, error, ...props }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor="#958c86"
        style={[styles.input, error && { borderColor: opsColors.danger }]}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});
export function OpsLoading({
  label = "Loading operations…",
}: {
  label?: string;
}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={opsColors.brand} />
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}
export function OpsEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={[styles.subtitle, { textAlign: "center" }]}>{detail}</Text>
      {action}
    </View>
  );
}
export function OpsNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  const color =
    tone === "error"
      ? opsColors.danger
      : tone === "success"
        ? opsColors.success
        : opsColors.info;
  return (
    <View
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      style={[
        styles.notice,
        { borderColor: `${color}55`, backgroundColor: `${color}0d` },
      ]}
    >
      <Text style={{ color: opsColors.ink, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export const opsStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  split: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  grow: { flex: 1 },
  strong: { color: opsColors.ink, fontSize: 15, fontWeight: "800" },
  muted: { color: opsColors.muted, lineHeight: 20 },
  listGap: { gap: 10 },
  spacer: { height: 12 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: opsColors.canvas },
  content: { paddingBottom: 36 },
  header: {
    padding: 18,
    gap: 12,
    backgroundColor: opsColors.paper,
    borderBottomWidth: 1,
    borderBottomColor: opsColors.line,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 12, resizeMode: "contain" },
  logoFallback: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: opsColors.brand,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  title: {
    color: opsColors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  subtitle: { color: opsColors.muted, lineHeight: 19, fontSize: 13 },
  contextRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  branch: { flex: 1, color: opsColors.muted, fontSize: 12, textAlign: "right" },
  pill: {
    minHeight: 28,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  pillText: { fontSize: 10, fontWeight: "800" },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    backgroundColor: opsColors.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: opsColors.line,
    shadowColor: "#31261f",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  button: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  buttonCompact: { minHeight: 42, paddingHorizontal: 12 },
  buttonPrimary: {
    backgroundColor: opsColors.brand,
    borderColor: opsColors.brand,
  },
  buttonSecondary: {
    backgroundColor: opsColors.paper,
    borderColor: opsColors.line,
  },
  buttonDanger: { backgroundColor: "#fff1f0", borderColor: "#efb2ad" },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  buttonTextDark: { color: opsColors.ink },
  disabled: { opacity: 0.45 },
  sectionHeading: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: { color: opsColors.ink, fontSize: 18, fontWeight: "900" },
  metric: { minWidth: 145, flex: 1 },
  metricLabel: { color: opsColors.muted, fontSize: 12, fontWeight: "700" },
  metricValue: {
    color: opsColors.ink,
    fontSize: 25,
    fontWeight: "900",
    marginVertical: 5,
  },
  status: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: { fontSize: 10, fontWeight: "900" },
  field: { gap: 6 },
  label: { color: opsColors.ink, fontSize: 13, fontWeight: "800" },
  input: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: opsColors.line,
    backgroundColor: opsColors.paper,
    paddingHorizontal: 13,
    color: opsColors.ink,
    fontSize: 15,
  },
  error: { color: opsColors.danger, fontSize: 12 },
  center: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  empty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 28,
  },
  emptyTitle: { color: opsColors.ink, fontSize: 20, fontWeight: "900" },
  notice: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 13,
    borderWidth: 1,
    borderRadius: 10,
  },
});
