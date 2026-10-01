import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Bell,
  Boxes,
  ChefHat,
  ClipboardList,
  LogOut,
  RefreshCw,
  Store,
  Utensils,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { nextOrderStatuses, type OrderStatus } from "@italian-pizza/shared";
import { supabase } from "@/lib/supabase";
import { can, roleSurface } from "@/operations/access";
import { useOperations } from "@/operations/OperationsProvider";
import {
  OpsButton,
  OpsCard,
  OpsEmpty,
  OpsHeader,
  OpsLoading,
  OpsMetric,
  OpsNotice,
  OpsScreen,
  OpsSection,
  OpsStatus,
  opsColors,
  opsStyles,
} from "@/operations/ui";

type Tab = "dashboard" | "orders" | "kds" | "menu" | "inventory" | "tables" | "alerts";
type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  status: OrderStatus;
  operational_order_type: string;
  total: number;
  created_at: string;
};
type Product = {
  id: string;
  name: string;
  base_price: number;
  sale_price: number | null;
  is_available: boolean;
  branch_product_overrides?: { is_available: boolean | null }[];
};
type Ingredient = {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
};
type TableRow = {
  id: string;
  name: string;
  code: string;
  seats: number;
  restaurant_table_sessions?: {
    id: string;
    order_id: string;
    status: string;
  }[];
};
type AlertRow = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  created_at: string;
};
type Report = {
  summary?: {
    grossSales?: number;
    netSales?: number;
    orderCount?: number;
    averageOrder?: number;
  };
  inventory?: { lowStock?: number };
};
const money = (value: number) =>
  `Rs ${Math.round(value || 0).toLocaleString("en-PK")}`;

export default function AdminMobile() {
  const app = useOperations(),
    router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard"),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const [report, setReport] = useState<Report>({}),
    [orders, setOrders] = useState<Order[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [ingredients, setIngredients] = useState<Ingredient[]>([]),
    [tables, setTables] = useState<TableRow[]>([]),
    [alerts, setAlerts] = useState<AlertRow[]>([]);
  useEffect(() => {
    if (
      app.ready &&
      (!app.session || !app.access || roleSurface(app.access.role) !== "admin")
    )
      router.replace("/ops" as never);
  }, [app.access, app.ready, app.session, router]);
  const load = useCallback(async () => {
    if (!app.access || !app.branch) return;
    setLoading(true);
    setMessage("");
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    try {
      if (tab === "dashboard") {
        const result = await supabase.rpc("restaurant_report", {
          p_business_id: app.access.businessId,
          p_branch_id: app.branch.id,
          p_start: start.toISOString(),
          p_end: end.toISOString(),
        });
        if (result.error) throw result.error;
        setReport((result.data ?? {}) as Report);
      }
      if (tab === "orders" || tab === "kds") {
        let query = supabase
          .from("orders")
          .select(
            "id,order_number,customer_name,status,operational_order_type,total,created_at",
          )
          .eq("business_id", app.access.businessId)
          .eq("branch_id", app.branch.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (tab === "kds") query = query.in("status", ["CONFIRMED", "PREPARING"]);
        const result = await query;
        if (result.error) throw result.error;
        setOrders((result.data ?? []) as Order[]);
      }
      if (tab === "menu") {
        const result = await supabase
          .from("products")
          .select(
            "id,name,base_price,sale_price,is_available,branch_product_overrides!left(is_available)",
          )
          .eq("business_id", app.access.businessId)
          .eq("is_active", true)
          .eq("branch_product_overrides.branch_id", app.branch.id)
          .order("name")
          .limit(100);
        if (result.error) throw result.error;
        setProducts((result.data ?? []) as Product[]);
      }
      if (tab === "inventory") {
        const result = await supabase
          .from("ingredients")
          .select("id,name,unit,current_stock,minimum_stock")
          .eq("business_id", app.access.businessId)
          .eq("branch_id", app.branch.id)
          .eq("is_active", true)
          .order("name")
          .limit(100);
        if (result.error) throw result.error;
        setIngredients((result.data ?? []) as Ingredient[]);
      }
      if (tab === "tables") {
        const result = await supabase
          .from("restaurant_tables")
          .select(
            "id,name,code,seats,restaurant_table_sessions(id,order_id,status)",
          )
          .eq("business_id", app.access.businessId)
          .eq("branch_id", app.branch.id)
          .eq("is_active", true)
          .order("name");
        if (result.error) throw result.error;
        setTables((result.data ?? []) as TableRow[]);
      }
      if (tab === "alerts") {
        const result = await supabase
          .from("notifications")
          .select("id,title,message,notification_type,created_at")
          .eq("business_id", app.access.businessId)
          .eq("is_read", false)
          .order("created_at", { ascending: false })
          .limit(50);
        if (result.error) throw result.error;
        setAlerts((result.data ?? []) as AlertRow[]);
      }
    } catch {
      setMessage(
        "This operational data could not be refreshed. Existing information remains visible.",
      );
    } finally {
      setLoading(false);
    }
  }, [app.access, app.branch, tab]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, app.revision]);
  const changeStatus = async (order: Order, status: OrderStatus) => {
    if (!app.access || !can(app.access, "orders.manage")) return;
    setMessage("Updating order…");
    const result = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order.id)
      .eq("business_id", app.access.businessId)
      .eq("branch_id", app.branch!.id)
      .eq("status", order.status)
      .select("id")
      .maybeSingle();
    setMessage(
      result.error || !result.data
        ? "Order changed elsewhere. Refresh and try again."
        : "Order status updated.",
    );
    if (result.data) void load();
  };
  const toggleProduct = async (product: Product) => {
    if (!app.access || !can(app.access, "products.manage")) return;
    const current =
        product.branch_product_overrides?.[0]?.is_available ??
        product.is_available,
      next = !current;
    setProducts((rows) =>
      rows.map((row) =>
        row.id === product.id
          ? { ...row, branch_product_overrides: [{ is_available: next }] }
          : row,
      ),
    );
    const result = await supabase
      .from("branch_product_overrides")
      .upsert(
        {
          business_id: app.access.businessId,
          branch_id: app.branch!.id,
          product_id: product.id,
          is_available: next,
        },
        { onConflict: "branch_id,product_id" },
      );
    if (result.error) {
      setProducts((rows) =>
        rows.map((row) => (row.id === product.id ? product : row)),
      );
      setMessage(
        "Availability could not be saved. The previous value was restored.",
      );
    }
  };
  if (!app.access || !app.branch)
    return (
      <OpsScreen>
        <OpsLoading />
      </OpsScreen>
    );
  const summary = report.summary ?? {};
  return (
    <OpsScreen>
      <OpsHeader
        title="Restaurant Admin"
        subtitle="Live operational companion"
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            onPress={() => void app.signOut()}
          >
            <LogOut color={opsColors.muted} size={22} />
          </Pressable>
        }
      />
      {app.access.branches.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
          }}
        >
          {app.access.branches.map((branch) => (
            <OpsButton
              key={branch.id}
              compact
              tone={branch.id === app.branch?.id ? "primary" : "secondary"}
              title={branch.name}
              onPress={() => void app.selectBranch(branch)}
            />
          ))}
        </ScrollView>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        {(
          [
            ["dashboard", "Overview", Store],
            ["orders", "Orders", ClipboardList],
            ["kds", "Kitchen", ChefHat],
            ["menu", "Menu", Utensils],
            ["inventory", "Inventory", Boxes],
            ["tables", "Tables", Store],
            ["alerts", "Alerts", Bell],
          ] as const
        )
          .filter(
            ([value]) =>
              value === "dashboard" ||
              value === "tables" ||
              value === "alerts" ||
              (value === "orders" && can(app.access!, "orders.read")) ||
              (value === "kds" && can(app.access!, "kds.use")) ||
              (value === "menu" && can(app.access!, "products.manage")) ||
              (value === "inventory" && can(app.access!, "inventory.read")),
          )
          .map(([value, label]) => (
            <OpsButton
              key={value}
              compact
              tone={tab === value ? "primary" : "secondary"}
              title={label}
              onPress={() => setTab(value)}
            />
          ))}
      </ScrollView>
      {message ? (
        <OpsNotice
          tone={/could not|changed/i.test(message) ? "error" : "success"}
        >
          {message}
        </OpsNotice>
      ) : null}
      {loading ? (
        <OpsLoading label="Refreshing this panel…" />
      ) : tab === "dashboard" ? (
        <>
          <OpsSection
            title="Today"
            detail="Same canonical report as Restaurant Admin web"
            action={
              <Pressable
                accessibilityLabel="Refresh dashboard"
                onPress={() => void load()}
              >
                <RefreshCw color={opsColors.brand} size={21} />
              </Pressable>
            }
          />
          <View style={[opsStyles.split, { paddingHorizontal: 10 }]}>
            <OpsMetric label="Net sales" value={money(summary.netSales ?? 0)} />
            <OpsMetric label="Orders" value={String(summary.orderCount ?? 0)} />
            <OpsMetric
              label="Average order"
              value={money(summary.averageOrder ?? 0)}
            />
            <OpsMetric
              label="Low stock"
              value={String(report.inventory?.lowStock ?? 0)}
            />
          </View>
        </>
      ) : tab === "orders" || tab === "kds" ? (
        <>
          <OpsSection
            title={tab === "kds" ? "Kitchen queue" : "Recent orders"}
            detail={tab === "kds" ? "Confirmed and preparing orders" : "Realtime branch queue"}
          />
          {orders.length ? (
            orders.map((order) => (
              <OpsCard key={order.id}>
                <View style={opsStyles.row}>
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>{order.order_number}</Text>
                    <Text style={opsStyles.muted}>
                      {order.customer_name} · {order.operational_order_type}
                    </Text>
                  </View>
                  <OpsStatus value={order.status} />
                </View>
                <View style={[opsStyles.row, { marginTop: 12 }]}>
                  <Text style={[opsStyles.strong, { flex: 1 }]}>
                    {money(order.total)}
                  </Text>
                  {nextOrderStatuses[order.status]
                    ?.slice(0, 2)
                    .map((status) => (
                      <OpsButton
                        key={status}
                        compact
                        tone={status === "CANCELLED" ? "danger" : "secondary"}
                        title={status.replaceAll("_", " ")}
                        disabled={!can(app.access!, "orders.manage")}
                        onPress={() => void changeStatus(order, status)}
                      />
                    ))}
                </View>
              </OpsCard>
            ))
          ) : (
            <OpsEmpty
              title="No orders"
              detail="New orders for this branch will appear here."
            />
          )}
        </>
      ) : tab === "menu" ? (
        <>
          <OpsSection
            title="Menu availability"
            detail="Quick branch-level 86 controls"
          />
          {products.length ? (
            products.map((product) => {
              const available =
                product.branch_product_overrides?.[0]?.is_available ??
                product.is_available;
              return (
                <OpsCard key={product.id}>
                  <View style={opsStyles.row}>
                    <View style={opsStyles.grow}>
                      <Text style={opsStyles.strong}>{product.name}</Text>
                      <Text style={opsStyles.muted}>
                        {money(product.sale_price ?? product.base_price)}
                      </Text>
                    </View>
                    <OpsStatus
                      value={available ? "AVAILABLE" : "UNAVAILABLE"}
                    />
                    <OpsButton
                      compact
                      tone="secondary"
                      title={available ? "Mark unavailable" : "Make available"}
                      onPress={() => void toggleProduct(product)}
                    />
                  </View>
                </OpsCard>
              );
            })
          ) : (
            <OpsEmpty
              title="No products"
              detail="No active menu products were found."
            />
          )}
        </>
      ) : tab === "inventory" ? (
        <>
          <OpsSection
            title="Stock"
            detail="Read-only branch inventory snapshot"
          />
          {ingredients.length ? (
            ingredients.map((item) => (
              <OpsCard key={item.id}>
                <View style={opsStyles.row}>
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>{item.name}</Text>
                    <Text style={opsStyles.muted}>
                      Minimum {item.minimum_stock} {item.unit}
                    </Text>
                  </View>
                  <Text
                    style={[
                      opsStyles.strong,
                      {
                        color:
                          Number(item.current_stock) <=
                          Number(item.minimum_stock)
                            ? opsColors.danger
                            : opsColors.ink,
                      },
                    ]}
                  >
                    {item.current_stock} {item.unit}
                  </Text>
                </View>
              </OpsCard>
            ))
          ) : (
            <OpsEmpty
              title="No ingredients"
              detail="Inventory is not configured for this branch."
            />
          )}
        </>
      ) : tab === "tables" ? (
        <>
          <OpsSection title="Tables" detail="Current canonical session state" />
          {tables.length ? (
            tables.map((table) => {
              const open = table.restaurant_table_sessions?.find(
                (session) => session.status === "OPEN",
              );
              return (
                <OpsCard key={table.id}>
                  <View style={opsStyles.row}>
                    <View style={opsStyles.grow}>
                      <Text style={opsStyles.strong}>{table.name}</Text>
                      <Text style={opsStyles.muted}>
                        {table.code} · {table.seats} seats
                      </Text>
                    </View>
                    <OpsStatus value={open ? "OCCUPIED" : "FREE"} />
                  </View>
                </OpsCard>
              );
            })
          ) : (
            <OpsEmpty
              title="No tables"
              detail="Configure active restaurant tables in Admin."
            />
          )}
        </>
      ) : (
        <>
          <OpsSection
            title="Operational alerts"
            detail="Unread server notifications"
          />
          {alerts.length ? (
            alerts.map((alert) => (
              <OpsCard key={alert.id}>
                <View style={opsStyles.row}>
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>{alert.title}</Text>
                    <Text style={opsStyles.muted}>{alert.message}</Text>
                  </View>
                  <OpsStatus value={alert.notification_type} />
                </View>
              </OpsCard>
            ))
          ) : (
            <OpsEmpty
              title="No alerts"
              detail="There are no unread operational alerts."
            />
          )}
        </>
      )}
    </OpsScreen>
  );
}
