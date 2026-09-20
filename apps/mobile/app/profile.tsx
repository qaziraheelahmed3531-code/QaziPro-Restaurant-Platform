import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Button, Field, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { Profile } from "@/contracts/types";
import { colors } from "@/ui/theme";

export default function ProfileScreen() {
  const app = useApp(),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [gender, setGender] = useState(""),
    [date, setDate] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!app.session) return;
    void app.api
      .request<{ profile: Profile }>("/profile", {
        token: app.session.access_token,
      })
      .then(({ data }) => {
        setName(data.profile.full_name ?? "");
        setPhone(data.profile.phone ?? "");
        setGender(data.profile.gender ?? "");
        setDate(data.profile.date_of_birth ?? "");
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, [app.api, app.session]);
  const save = async () => {
    try {
      await app.api.request("/profile", {
        method: "PATCH",
        token: app.session!.access_token,
        body: { fullName: name, phone, gender, dateOfBirth: date },
      });
      setMessage("Profile saved.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not save.");
    }
  };
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <Screen style={styles.screen}>
      <Text style={styles.title}>Profile</Text>
      <Field label="Full name" value={name} onChangeText={setName} />
      <Field
        label="Phone"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Field
        label="Gender (optional)"
        value={gender}
        onChangeText={setGender}
      />
      <Field
        label="Date of birth YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
      />
      {message ? (
        <Notice tone={message === "Profile saved." ? "success" : "error"}>
          {message}
        </Notice>
      ) : null}
      <Button title="Save profile" onPress={() => void save()} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 20, gap: 14 },
  title: { fontSize: 27, fontWeight: "900", color: colors.ink },
});
