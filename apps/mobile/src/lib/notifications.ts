import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { env } from "@/config/env";
import { supabase } from "./supabase";
import type { MobileApi } from "./api";
import { secureStorage } from "./storage";
import type { OperationsAccess, OperationsBranch } from "@/operations/types";

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
      appVersion: Constants.expoConfig?.version ?? "unknown",
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

export async function registerStaffPush(access: OperationsAccess, branch: OperationsBranch) {
  if (!env.pushEnabled)
    throw new Error("Push is disabled until staging provider credentials are configured.");
  if (!Device.isDevice)
    throw new Error("Push notifications require a physical device or configured native emulator.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("operations", {
      name: "Restaurant operations",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notification permission was not granted.");
  const native = await Notifications.getDevicePushTokenAsync();
  const result = await supabase.rpc("register_staff_device", {
    p_business_id: access.businessId,
    p_branch_id: branch.id,
    p_device_id: await deviceId(),
    p_platform: Platform.OS === "ios" ? "ios" : "android",
    p_push_token: String(native.data),
    p_app_version: Constants.expoConfig?.version ?? "unknown",
    p_locale: Intl.DateTimeFormat().resolvedOptions().locale,
  });
  if (result.error) throw new Error("This device could not be registered for staff notifications.");
  return result.data;
}

export async function unregisterStaffPush(access: OperationsAccess) {
  const result = await supabase.rpc("unregister_staff_device", {
    p_business_id: access.businessId,
    p_device_id: await deviceId(),
  });
  if (result.error) throw new Error("This device could not be removed from staff notifications.");
  return Boolean(result.data);
}
