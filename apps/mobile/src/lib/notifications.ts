import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { env } from "@/config/env";
import type { MobileApi } from "./api";
import { secureStorage } from "./storage";

const DEVICE_KEY = "qazipro-mobile-device-id";
export async function deviceId() {
  let id = await secureStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await secureStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
export async function registerPush(api: MobileApi, token: string) {
  if (!env.pushEnabled)
    throw new Error(
      "Push is disabled until staging provider credentials are configured.",
    );
  if (!Device.isDevice)
    throw new Error(
      "Remote push tokens require a physical device or configured native emulator.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notification permission was not granted.");
  const native = await Notifications.getDevicePushTokenAsync(),
    id = await deviceId();
  return api.request("/devices", {
    method: "POST",
    token,
    body: {
      deviceId: id,
      platform: Platform.OS === "ios" ? "ios" : "android",
      pushToken: String(native.data),
      appVersion: "0.1.0",
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
    },
  });
}
export async function unregisterPush(api: MobileApi, token: string) {
  const id = await deviceId();
  return api.request("/devices", {
    method: "DELETE",
    token,
    query: { deviceId: id },
  });
}
