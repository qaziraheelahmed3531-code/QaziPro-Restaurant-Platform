import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// SecureStore is native-only. The browser preview deliberately keeps auth
// values in memory so tokens are never persisted in browser storage.
const webSession = new Map<string, string>();
export const secureStorage =
  Platform.OS === "web"
    ? {
        getItem: async (key: string) => webSession.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          webSession.set(key, value);
        },
        removeItem: async (key: string) => {
          webSession.delete(key);
        },
      }
    : {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) =>
          SecureStore.setItemAsync(key, value, {
            keychainAccessible:
              SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
          }),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      };

export async function readJson<T>(key: string): Promise<T | null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
export const writeJson = (key: string, value: unknown) =>
  AsyncStorage.setItem(key, JSON.stringify(value));
export const removeLocal = (key: string) => AsyncStorage.removeItem(key);
