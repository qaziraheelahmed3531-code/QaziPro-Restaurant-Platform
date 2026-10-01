import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyRound, Mail, ShieldCheck } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useOperations } from "@/operations/OperationsProvider";
import {
  OpsButton,
  OpsCard,
  OpsField,
  OpsNotice,
  OpsScreen,
  opsColors,
  opsStyles,
} from "@/operations/ui";

export default function OperationsLogin() {
  const app = useOperations(),
    router = useRouter(),
    viewport = useWindowDimensions();
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [seconds, setSeconds] = useState(0),
    codeRef = useRef<TextInput>(null);
  useEffect(() => {
    if (app.session) router.replace("/ops" as never);
  }, [app.session, router]);
  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(
      () => setSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [seconds]);
  const validEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email],
  );
  const request = async () => {
    try {
      await app.requestOtp(email);
      setSent(true);
      setSeconds(45);
      setTimeout(() => codeRef.current?.focus(), 80);
    } catch {}
  };
  const verify = async () => {
    try {
      await app.verifyOtp(email, code);
      router.replace("/ops" as never);
    } catch {}
  };
  return (
    <OpsScreen scroll={false}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "center" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            width: Math.min(Math.max(288, viewport.width - 32), 560),
            alignSelf: "center",
            paddingVertical: 28,
          }}
        >
          <View
            style={{
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 24,
              marginBottom: 14,
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 17,
                backgroundColor: opsColors.brand,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck color="#fff" size={29} />
            </View>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 28, fontWeight: "900", color: opsColors.ink }}
            >
              QaziPro Operations
            </Text>
            <Text style={[opsStyles.muted, { textAlign: "center" }]}>
              Restaurant Admin, Waiter and Rider access from one secure app.
            </Text>
          </View>
          <OpsCard style={{ gap: 14 }}>
            {!sent ? (
              <>
                <View style={opsStyles.row}>
                  <Mail color={opsColors.brand} size={20} />
                  <Text style={opsStyles.strong}>Work email</Text>
                </View>
                <OpsField
                  label="Work email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (validEmail && !app.busy) void request();
                  }}
                />
                <OpsButton
                  title={app.busy ? "Sending code…" : "Send 8-digit code"}
                  disabled={!validEmail || app.busy}
                  onPress={() => void request()}
                />
                <View style={opsStyles.row}>
                  <View
                    style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: opsColors.line,
                    }}
                  />
                  <Text style={opsStyles.muted}>or</Text>
                  <View
                    style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: opsColors.line,
                    }}
                  />
                </View>
                <OpsButton
                  tone="secondary"
                  title={app.busy ? "Opening Google…" : "Continue with Google"}
                  disabled={app.busy}
                  onPress={() =>
                    void app.signInWithGoogle().catch(() => undefined)
                  }
                />
              </>
            ) : (
              <>
                <View style={opsStyles.row}>
                  <KeyRound color={opsColors.brand} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={opsStyles.strong}>Check your inbox</Text>
                    <Text style={opsStyles.muted}>{email}</Text>
                  </View>
                </View>
                <OpsField
                  ref={codeRef}
                  label="8-digit sign-in code"
                  value={code}
                  onChangeText={(value) =>
                    setCode(value.replace(/\D/g, "").slice(0, 8))
                  }
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (code.length === 8 && !app.busy) void verify();
                  }}
                />
                <OpsButton
                  title={app.busy ? "Verifying…" : "Verify & continue"}
                  disabled={code.length !== 8 || app.busy}
                  onPress={() => void verify()}
                />
                <OpsButton
                  tone="secondary"
                  title={seconds ? `Resend in ${seconds}s` : "Resend code"}
                  disabled={seconds > 0 || app.busy}
                  onPress={() => void request()}
                />
                <OpsButton
                  tone="secondary"
                  title="Use another email"
                  disabled={app.busy}
                  onPress={() => {
                    setSent(false);
                    setCode("");
                    setSeconds(0);
                  }}
                />
              </>
            )}
          </OpsCard>
          {app.error ? <OpsNotice tone="error">{app.error}</OpsNotice> : null}
          <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
            <Text
              style={[opsStyles.muted, { textAlign: "center", fontSize: 12 }]}
            >
              Only active staff memberships and enabled mobile entitlements can
              open operations.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </OpsScreen>
  );
}
