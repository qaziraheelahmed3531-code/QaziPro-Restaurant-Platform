import type { Session } from "@supabase/supabase-js";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { supabase, startAuthRefresh } from "@/lib/supabase";
import { secureStorage } from "@/lib/storage";
import { flushSafeOutbox } from "./outbox";
import { resolveOperationsAccess } from "./access";
import type {
  ConnectionState,
  OperationsAccess,
  OperationsBranch,
} from "./types";

const BRANCH_KEY = "qazipro:operations:branch:v1";
type State = {
  ready: boolean;
  busy: boolean;
  error: string | null;
  session: Session | null;
  access: OperationsAccess | null;
  branch: OperationsBranch | null;
  connection: ConnectionState;
  revision: number;
  queued: number;
  signInWithGoogle: () => Promise<void>;
  requestOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectBranch: (branch: OperationsBranch) => Promise<void>;
  refreshAccess: () => Promise<void>;
  syncNow: () => Promise<void>;
};
const Context = createContext<State | null>(null);

const friendly = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  if (/network|fetch|offline/i.test(message))
    return "You're offline. Existing work remains available.";
  if (/invalid|expired|token/i.test(message))
    return "That code is invalid or expired. Request a new code.";
  if (/permission|denied|access/i.test(message))
    return message || "You don't have permission for this action.";
  return fallback;
};

export function OperationsProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null),
    [access, setAccess] = useState<OperationsAccess | null>(null),
    [branch, setBranch] = useState<OperationsBranch | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("RECONNECTING"),
    [revision, setRevision] = useState(0),
    [queued, setQueued] = useState(0);
  const loading = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);

  const refreshAccess = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = (await supabase.auth.getSession()).data.session;
      setSession(current);
      if (!current) {
        setAccess(null);
        setBranch(null);
        return;
      }
      const resolved = await resolveOperationsAccess(supabase, current);
      const saved = await secureStorage.getItem(BRANCH_KEY);
      const selected =
        resolved.branches.find((item) => item.id === saved) ??
        resolved.branches[0];
      if (saved && selected.id !== saved)
        await secureStorage.removeItem(BRANCH_KEY);
      setAccess(resolved);
      setBranch(selected);
      setConnection("ONLINE");
    } catch (reason) {
      setAccess(null);
      setBranch(null);
      setError(friendly(reason, "Restaurant access could not be loaded."));
    } finally {
      loading.current = false;
      setBusy(false);
      setReady(true);
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (!access) return;
    setConnection("SYNCING");
    try {
      const result = await flushSafeOutbox(supabase, access);
      setQueued(result.remaining);
      setRevision((value) => value + 1);
      setConnection("ONLINE");
    } catch {
      setConnection("DEGRADED");
    }
  }, [access]);

  useEffect(() => {
    syncRef.current = syncNow;
  }, [syncNow]);

  useEffect(() => {
    let active = true;
    const stop = startAuthRefresh();
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        void refreshAccess();
      }
    });
    const auth = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      void refreshAccess();
    });
    const network = Network.addNetworkStateListener((state) => {
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      setConnection((current) =>
        online
          ? current === "OFFLINE"
            ? "RECONNECTING"
            : "ONLINE"
          : "OFFLINE",
      );
      if (online) void syncRef.current();
    });
    return () => {
      active = false;
      stop();
      auth.data.subscription.unsubscribe();
      network.remove();
    };
  }, [refreshAccess]);

  useEffect(() => {
    if (!access || !branch || connection === "OFFLINE") return;
    const channel = supabase
      .channel(`mobile-ops:${access.businessId}:${branch.id}:${access.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branch.id}`,
        },
        () => setRevision((value) => value + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_table_service_requests",
          filter: `branch_id=eq.${branch.id}`,
        },
        () => setRevision((value) => value + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "branch_product_overrides",
          filter: `branch_id=eq.${branch.id}`,
        },
        () => setRevision((value) => value + 1),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setConnection("DEGRADED");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [access, branch, connection]);

  const requestOtp = useCallback(async (email: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false },
      });
      if (result.error) throw result.error;
    } catch (reason) {
      const message = friendly(reason, "The sign-in code could not be sent.");
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, []);
  const verifyOtp = useCallback(async (email: string, token: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (result.error) throw result.error;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason) {
      const message = friendly(
        reason,
        "The sign-in code could not be verified.",
      );
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, []);
  const signInWithGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const redirectTo = Linking.createURL("ops/auth/callback");
      const result = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: Platform.OS !== "web" },
      });
      if (result.error) throw result.error;
      if (Platform.OS !== "web" && result.data.url) {
        const browser = await WebBrowser.openAuthSessionAsync(
          result.data.url,
          redirectTo,
        );
        if (browser.type === "success") {
          const code = new URL(browser.url).searchParams.get("code");
          if (!code)
            throw new Error("Google did not return a secure sign-in code.");
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
        }
      }
    } catch (reason) {
      const message = friendly(reason, "Google sign-in could not be opened.");
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }, []);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    await secureStorage.removeItem(BRANCH_KEY);
    setAccess(null);
    setBranch(null);
  }, []);
  const selectBranch = useCallback(
    async (selected: OperationsBranch) => {
      if (!access?.branches.some((item) => item.id === selected.id))
        throw new Error("Restaurant access denied.");
      await secureStorage.setItem(BRANCH_KEY, selected.id);
      setBranch(selected);
      setRevision((value) => value + 1);
    },
    [access],
  );
  const value = useMemo<State>(
    () => ({
      ready,
      busy,
      error,
      session,
      access,
      branch,
      connection,
      revision,
      queued,
      signInWithGoogle,
      requestOtp,
      verifyOtp,
      signOut,
      selectBranch,
      refreshAccess,
      syncNow,
    }),
    [
      ready,
      busy,
      error,
      session,
      access,
      branch,
      connection,
      revision,
      queued,
      signInWithGoogle,
      requestOtp,
      verifyOtp,
      signOut,
      selectBranch,
      refreshAccess,
      syncNow,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOperations() {
  const value = useContext(Context);
  if (!value) throw new Error("OperationsProvider is missing");
  return value;
}
