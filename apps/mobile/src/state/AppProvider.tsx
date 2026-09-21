import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import * as Linking from "expo-linking";
import type {
  Bootstrap,
  Branch,
  Cart,
  CartLine,
  Catalog,
  CheckoutPayload,
  PublicOrder,
} from "@/contracts/types";
import { env } from "@/config/env";
import { MobileApi } from "@/lib/api";
import { readJson, removeLocal, secureStorage, writeJson } from "@/lib/storage";
import { startAuthRefresh, supabase } from "@/lib/supabase";
import {
  addLine,
  clearCart,
  emptyCart,
  replaceLine,
  restoreStoredCart,
  updateLine,
} from "@/domain/cart";
import { createAttempt, type CheckoutAttempt } from "@/domain/checkout";
import { restoreBranch } from "@/domain/branch";

const BRANCH_KEY = `mobile:${env.restaurantKey}:branch`,
  CART_KEY = `mobile:${env.restaurantKey}:cart`,
  BOOTSTRAP_KEY = `mobile:${env.restaurantKey}:bootstrap`,
  ATTEMPT_KEY = `mobile:${env.restaurantKey}:checkout-attempt`;
type State = {
  ready: boolean;
  busy: boolean;
  offline: boolean;
  error: string | null;
  bootstrap: Bootstrap | null;
  branch: Branch | null;
  catalog: Catalog | null;
  cart: Cart;
  session: Session | null;
  api: MobileApi;
  reload: () => Promise<void>;
  selectBranch: (branch: Branch) => Promise<void>;
  addToCart: (line: CartLine) => Promise<void>;
  editCartLine: (lineId: string, line: CartLine) => Promise<void>;
  replaceCart: (cart: Cart) => Promise<void>;
  setQuantity: (id: string, quantity: number) => Promise<void>;
  empty: () => Promise<void>;
  setCoupon: (code?: string) => Promise<void>;
  setLoyalty: (coins: number) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  placeOrder: (
    payload: Omit<CheckoutPayload, "idempotencyKey" | "items">,
  ) => Promise<PublicOrder>;
};
const Context = createContext<State | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null),
    [branch, setBranch] = useState<Branch | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [session, setSession] = useState<Session | null>(null);
  const [cart, setCart] = useState<Cart>(() =>
    emptyCart(env.restaurantKey, ""),
  );
  const api = useMemo(
    () =>
      new MobileApi(
        env.restaurantKey,
        () => void supabase.auth.signOut({ scope: "local" }),
      ),
    [],
  );
  const persistCart = useCallback(async (next: Cart) => {
    setCart(next);
    await writeJson(CART_KEY, next);
  }, []);
  const loadCatalog = useCallback(
    async (selected: Branch) => {
      const result = await api.request<Catalog>("/catalog", {
        branchId: selected.id,
      });
      return result.data;
    },
    [api],
  );
  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.request<Bootstrap>("/bootstrap");
      setBootstrap(result.data);
      await writeJson(BOOTSTRAP_KEY, result.data);
      const savedId = await secureStorage.getItem(BRANCH_KEY),
        selected = restoreBranch(result.data, savedId);
      if (savedId && !selected) await secureStorage.removeItem(BRANCH_KEY);
      const nextCatalog = selected ? await loadCatalog(selected) : null;
      setBranch(selected);
      setCatalog(nextCatalog);
      setOffline(false);
    } catch (reason) {
      const cached = await readJson<Bootstrap>(BOOTSTRAP_KEY);
      if (cached) {
        setBootstrap(cached);
        setOffline(true);
      } else
        setError(
          reason instanceof Error
            ? reason.message
            : "Restaurant could not be loaded.",
        );
    } finally {
      setBusy(false);
      setReady(true);
    }
  }, [api, loadCatalog]);
  useEffect(() => {
    let active = true;
    const stop = startAuthRefresh();
    void Promise.all([
      supabase.auth.getSession(),
      readJson<unknown>(CART_KEY),
    ]).then(([auth, saved]) => {
      if (!active) return;
      setSession(auth.data.session);
      const restored = restoreStoredCart(saved, env.restaurantKey);
      if (restored) setCart(restored);
      else if (saved) void removeLocal(CART_KEY);
      void reload();
    });
    const listener = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => {
      active = false;
      stop();
      listener.data.subscription.unsubscribe();
    };
  }, [reload]);
  const selectBranch = useCallback(
    async (selected: Branch) => {
      setBusy(true);
      try {
        await api.request(`/branches/${selected.id}`);
        const nextCatalog = await loadCatalog(selected);
        if (cart.branchId !== selected.id)
          await persistCart(clearCart(cart, selected.id));
        await secureStorage.setItem(BRANCH_KEY, selected.id);
        setBranch(selected);
        setCatalog(nextCatalog);
      } finally {
        setBusy(false);
      }
    },
    [api, cart, loadCatalog, persistCart],
  );
  const addToCart = useCallback(
    (line: CartLine) =>
      persistCart(
        addLine(
          cart.branchId ? cart : { ...cart, branchId: branch?.id ?? "" },
          line,
        ),
      ),
    [branch, cart, persistCart],
  );
  const editCartLine = useCallback(
    (lineId: string, line: CartLine) =>
      persistCart(replaceLine(cart, lineId, line)),
    [cart, persistCart],
  );
  const setQuantity = useCallback(
    (id: string, quantity: number) =>
      persistCart(updateLine(cart, id, quantity)),
    [cart, persistCart],
  );
  const empty = useCallback(
    () => persistCart(clearCart(cart)),
    [cart, persistCart],
  );
  const setCoupon = useCallback(
    (promoCode?: string) =>
      persistCart({ ...cart, promoCode, updatedAt: new Date().toISOString() }),
    [cart, persistCart],
  );
  const setLoyalty = useCallback(
    (loyaltyCoins: number) =>
      persistCart({
        ...cart,
        loyaltyCoins,
        updatedAt: new Date().toISOString(),
      }),
    [cart, persistCart],
  );
  const login = useCallback(async (email: string, password: string) => {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) throw authError;
  }, []);
  const signup = useCallback(
    async (email: string, password: string, name: string) => {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: Linking.createURL("auth/callback", {
            queryParams: { type: "signup" },
          }),
        },
      });
      if (authError) throw authError;
    },
    [],
  );
  const logout = useCallback(async () => {
    if (session?.access_token)
      await api
        .request("/auth/logout", {
          method: "POST",
          token: session.access_token,
        })
        .catch(() => undefined);
    await supabase.auth.signOut({ scope: "local" });
  }, [api, session]);
  const placeOrder = useCallback(
    async (base: Omit<CheckoutPayload, "idempotencyKey" | "items">) => {
      if (!branch || cart.lines.length === 0)
        throw new Error("Your cart is empty.");
      const payload = {
        ...base,
        branchId: branch.id,
        loyaltyCoinsToRedeem: cart.loyaltyCoins,
        promoCode: cart.promoCode,
        items: cart.lines.map((line) => ({
          itemKind: line.itemKind,
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          modifiers: line.modifiers.map(({ groupId, optionId }) => ({
            groupId,
            optionId,
          })),
        })),
      };
      const previous = await readJson<CheckoutAttempt>(ATTEMPT_KEY),
        attempt = await createAttempt(payload, previous);
      await writeJson(ATTEMPT_KEY, attempt);
      const result = await api.request<{ order: PublicOrder }>("/orders", {
        method: "POST",
        branchId: branch.id,
        token: session?.access_token,
        body: attempt.payload,
        timeoutMs: 30000,
      });
      const order = result.data.order,
        number = String(order.orderNumber ?? order.order_number ?? "");
      if (order.guestTrackingToken && number)
        await secureStorage.setItem(
          `order-token:${env.restaurantKey}:${number}`,
          order.guestTrackingToken,
        );
      await removeLocal(ATTEMPT_KEY);
      await persistCart(clearCart(cart));
      return order;
    },
    [api, branch, cart, persistCart, session],
  );
  return (
    <Context.Provider
      value={{
        ready,
        busy,
        offline,
        error,
        bootstrap,
        branch,
        catalog,
        cart,
        session,
        api,
        reload,
        selectBranch,
        addToCart,
        editCartLine,
        replaceCart: persistCart,
        setQuantity,
        empty,
        setCoupon,
        setLoyalty,
        login,
        signup,
        logout,
        placeOrder,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("AppProvider is missing");
  return value;
}
