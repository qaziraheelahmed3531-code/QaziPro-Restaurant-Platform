import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useApp } from "@/state/AppProvider";
import { colors, shadow, themeColors } from "./theme";

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = themeColors(useApp().bootstrap?.colors);
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: palette.background }, style]}
    >
      {children}
    </SafeAreaView>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled,
  kind = "primary",
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: "primary" | "secondary" | "danger";
  accessibilityLabel?: string;
}) {
  const palette = themeColors(useApp().bootstrap?.colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`${kind}Button`],
        kind === "primary" && { backgroundColor: palette.primary },
        (pressed || disabled) && styles.buttonDim,
      ]}
    >
      <Text
        style={[styles.buttonText, kind !== "primary" && styles.secondaryText]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const palette = themeColors(useApp().bootstrap?.colors);
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor="#9b918a"
        style={[
          styles.input,
          { color: palette.ink },
          error && styles.inputError,
        ]}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
export function Empty({
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
      <Text style={styles.muted}>{detail}</Text>
      {action}
    </View>
  );
}
export function Notice({
  children,
  tone = "info",
}: PropsWithChildren<{ tone?: "info" | "error" | "success" }>) {
  return (
    <View
      accessibilityLiveRegion={tone === "error" ? "assertive" : "polite"}
      style={[styles.notice, styles[`${tone}Notice`]]}
    >
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    marginHorizontal: 16,
    marginVertical: 7,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  primaryButton: { backgroundColor: colors.primary },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  dangerButton: {
    backgroundColor: "#fff0ef",
    borderWidth: 1,
    borderColor: "#efb6b1",
  },
  buttonDim: { opacity: 0.52 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryText: { color: colors.ink },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: colors.ink },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: "#fff",
    color: colors.ink,
    fontSize: 15,
  },
  inputError: { borderColor: colors.danger },
  error: { fontSize: 12, color: colors.danger },
  center: {
    flex: 1,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  muted: { color: colors.muted, textAlign: "center", lineHeight: 21 },
  empty: {
    flex: 1,
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 28,
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  notice: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 13,
    borderRadius: 12,
  },
  infoNotice: { backgroundColor: "#eef4ff" },
  errorNotice: { backgroundColor: "#fff0ef" },
  successNotice: { backgroundColor: "#edf8f0" },
  noticeText: { color: colors.ink, lineHeight: 19 },
});
