import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Field, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { colors } from "@/ui/theme";

export default function Auth() {
  const app = useApp(),
    router = useRouter(),
    [signup, setSignup] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (signup) {
        await app.signup(email.trim(), password, name.trim());
        Alert.alert(
          "Check your email",
          "Verify your address, then return to sign in.",
        );
        setSignup(false);
      } else {
        await app.login(email.trim(), password);
        router.back();
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const forgot = async () => {
    if (!email.trim()) return setError("Enter your email first.");
    try {
      await app.api.request("/auth/password-reset", {
        method: "POST",
        body: { email: email.trim() },
      });
      Alert.alert(
        "Request accepted",
        "If this account exists, reset instructions will be sent.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Reset request failed.",
      );
    }
  };
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {signup ? "Create account" : "Welcome back"}
          </Text>
          <Text style={styles.copy}>
            Sign in for saved addresses, rewards, favourites and order history.
          </Text>
          {signup ? (
            <Field
              label="Full name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          ) : null}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            title={
              busy ? "Please wait…" : signup ? "Create account" : "Sign in"
            }
            disabled={busy || !email || !password}
            onPress={() => void submit()}
          />
          {!signup ? (
            <Button
              kind="secondary"
              title="Forgot password"
              onPress={() => void forgot()}
            />
          ) : null}
          <View style={styles.switch}>
            <Text>{signup ? "Already registered?" : "New here?"}</Text>
            <Button
              kind="secondary"
              title={signup ? "Sign in" : "Create account"}
              onPress={() => setSignup((value) => !value)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 24, gap: 15 },
  title: { fontSize: 30, fontWeight: "900", color: colors.ink },
  copy: { color: colors.muted, lineHeight: 21 },
  switch: { marginTop: 10, gap: 10, alignItems: "center" },
});
