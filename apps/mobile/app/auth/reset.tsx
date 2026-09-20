import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button, Field, Notice, Screen } from "@/ui/components";
import { supabase } from "@/lib/supabase";
import { colors } from "@/ui/theme";

export default function Reset() {
  const router = useRouter(),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [message, setMessage] = useState("");
  const submit = async () => {
    if (password.length < 8 || password !== confirm)
      return setMessage(
        "Use at least 8 characters and make both passwords match.",
      );
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMessage(error.message);
    router.replace("/(tabs)/account");
  };
  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>Choose a new password</Text>
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />
      {message ? <Notice tone="error">{message}</Notice> : null}
      <Button title="Update password" onPress={() => void submit()} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 24, gap: 16 },
  title: { fontSize: 27, fontWeight: "900", color: colors.ink },
});
