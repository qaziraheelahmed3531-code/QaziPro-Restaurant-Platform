import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  BellRing,
  LogOut,
  Minus,
  Plus,
  ShoppingCart,
  Utensils,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { queueSafeOperation } from "@/operations/outbox";
import { roleSurface } from "@/operations/access";
import { useOperations } from "@/operations/OperationsProvider";
import {
  OpsButton,
  OpsCard,
  OpsEmpty,
  OpsField,
  OpsHeader,
  OpsLoading,
  OpsNotice,
  OpsScreen,
  OpsSection,
  OpsStatus,
  opsColors,
  opsStyles,
} from "@/operations/ui";
import type { WaiterTable } from "@/operations/types";

type Product = {
  id: string;
  name: string;
  base_price: number;
  sale_price: number | null;
  is_available: boolean;
  product_variants: {
    id: string;
    name: string;
    price_adjustment: number;
    is_default: boolean;
    is_active: boolean;
  }[];
  product_modifier_groups: {
    modifier_groups: {
      id: string;
      name: string;
      selection_type: "SINGLE" | "MULTIPLE";
      is_required: boolean;
      min_selections: number;
      max_selections: number | null;
      modifier_options: {
        id: string;
        name: string;
        price_adjustment: number;
        is_active: boolean;
        is_default: boolean;
      }[];
    };
  }[];
};
type Choice = {
  groupId: string;
  optionId: string;
  groupName: string;
  optionName: string;
  price: number;
};
type CartLine = {
  id: string;
  productId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  choices: Choice[];
};
type Draft = {
  intentId: string;
  tableId: string | null;
  lines: CartLine[];
  notes: string;
  updatedAt: string;
};
type ServiceRequest = {
  id: string;
  table_id: string;
  status: string;
  request_type?: string;
  created_at: string;
  restaurant_tables?: { name: string } | null;
};
const money = (value: number) =>
  `Rs ${Math.round(value).toLocaleString("en-PK")}`;

export default function WaiterMobile() {
  const app = useOperations(),
    router = useRouter();
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"tables" | "menu" | "requests">("tables"),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const [tables, setTables] = useState<WaiterTable[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [requests, setRequests] = useState<ServiceRequest[]>([]),
    [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft>({
      intentId: Crypto.randomUUID(),
      tableId: null,
      lines: [],
      notes: "",
      updatedAt: new Date().toISOString(),
    }),
    [editing, setEditing] = useState<Product | null>(null),
    [variantId, setVariantId] = useState<string | undefined>(),
    [choices, setChoices] = useState<Choice[]>([]);
  const draftKey =
    app.access && app.branch
      ? `qazipro:waiter-draft:${app.access.userId}:${app.branch.id}`
      : "";
  useEffect(() => {
    if (
      app.ready &&
      (!app.session || !app.access || roleSurface(app.access.role) !== "waiter")
    )
      router.replace("/ops" as never);
  }, [app.access, app.ready, app.session, router]);
  useEffect(() => {
    if (!draftKey) return;
    void AsyncStorage.getItem(draftKey).then((value) => {
      if (!value) return;
      try {
        const saved = JSON.parse(value) as Draft;
        if (saved.intentId && Array.isArray(saved.lines)) setDraft(saved);
      } catch {}
    });
  }, [draftKey]);
  useEffect(() => {
    if (draftKey) void AsyncStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, draftKey]);
  const load = useCallback(async () => {
    if (!app.access || !app.branch) return;
    setLoading(true);
    setMessage("");
    const [tableResult, productResult, requestResult] = await Promise.all([
      supabase.rpc("waiter_table_dashboard", { p_branch_id: app.branch.id }),
      supabase
        .from("products")
        .select(
          "id,name,base_price,sale_price,is_available,product_variants(id,name,price_adjustment,is_default,is_active),product_modifier_groups(modifier_groups(id,name,selection_type,is_required,min_selections,max_selections,modifier_options(id,name,price_adjustment,is_active,is_default)))",
        )
        .eq("business_id", app.access.businessId)
        .eq("is_active", true)
        .eq("is_available", true)
        .order("name")
        .limit(150),
      supabase
        .from("restaurant_table_service_requests")
        .select(
          "id,table_id,status,request_type,created_at,restaurant_tables(name)",
        )
        .eq("business_id", app.access.businessId)
        .eq("branch_id", app.branch.id)
        .in("status", ["PENDING", "ACKNOWLEDGED"])
        .order("created_at"),
    ]);
    if (tableResult.error || productResult.error || requestResult.error)
      setMessage(
        "Live waiter data could not be refreshed. Your unsent draft is safe.",
      );
    else {
      setTables((tableResult.data ?? []) as WaiterTable[]);
      setProducts((productResult.data ?? []) as unknown as Product[]);
      setRequests((requestResult.data ?? []) as unknown as ServiceRequest[]);
    }
    setLoading(false);
  }, [app.access, app.branch]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, app.revision]);
  const selectedTable = tables.find((table) => table.id === draft.tableId),
    total = draft.lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          !query || product.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [products, query],
  );
  const openProduct = (product: Product) => {
    setEditing(product);
    setVariantId(
      product.product_variants.find((item) => item.is_default && item.is_active)
        ?.id ?? product.product_variants.find((item) => item.is_active)?.id,
    );
    setChoices(
      product.product_modifier_groups.flatMap((link) =>
        link.modifier_groups.modifier_options
          .filter((option) => option.is_active && option.is_default)
          .map((option) => ({
            groupId: link.modifier_groups.id,
            optionId: option.id,
            groupName: link.modifier_groups.name,
            optionName: option.name,
            price: option.price_adjustment,
          })),
      ),
    );
  };
  const toggleChoice = (
    group: Product["product_modifier_groups"][number]["modifier_groups"],
    option: Product["product_modifier_groups"][number]["modifier_groups"]["modifier_options"][number],
  ) => {
    setChoices((current) => {
      const exists = current.some((item) => item.optionId === option.id);
      if (exists) return current.filter((item) => item.optionId !== option.id);
      const withoutGroup =
        group.selection_type === "SINGLE"
          ? current.filter((item) => item.groupId !== group.id)
          : current;
      if (
        group.max_selections &&
        withoutGroup.filter((item) => item.groupId === group.id).length >=
          group.max_selections
      )
        return current;
      return [
        ...withoutGroup,
        {
          groupId: group.id,
          optionId: option.id,
          groupName: group.name,
          optionName: option.name,
          price: option.price_adjustment,
        },
      ];
    });
  };
  const addConfigured = () => {
    if (!editing) return;
    const invalid = editing.product_modifier_groups.some((link) => {
      const count = choices.filter(
        (choice) => choice.groupId === link.modifier_groups.id,
      ).length;
      return (
        count <
        (link.modifier_groups.is_required
          ? Math.max(1, link.modifier_groups.min_selections)
          : link.modifier_groups.min_selections)
      );
    });
    if (invalid) {
      setMessage("Choose the required product options first.");
      return;
    }
    const variant = editing.product_variants.find(
        (item) => item.id === variantId,
      ),
      unitPrice =
        (editing.sale_price ?? editing.base_price) +
        (variant?.price_adjustment ?? 0) +
        choices.reduce((sum, item) => sum + item.price, 0);
    const signature = `${editing.id}:${variantId ?? "base"}:${choices
      .map((item) => item.optionId)
      .sort()
      .join(",")}`;
    setDraft((current) => {
      const existing = current.lines.find((line) => line.id === signature);
      return {
        ...current,
        lines: existing
          ? current.lines.map((line) =>
              line.id === signature
                ? { ...line, quantity: line.quantity + 1 }
                : line,
            )
          : [
              ...current.lines,
              {
                id: signature,
                productId: editing.id,
                name: editing.name,
                variantId,
                variantName: variant?.name,
                quantity: 1,
                unitPrice,
                choices,
              },
            ],
        updatedAt: new Date().toISOString(),
      };
    });
    setEditing(null);
    setChoices([]);
  };
  const quantity = (id: string, delta: number) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines
        .map((line) =>
          line.id === id
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
      updatedAt: new Date().toISOString(),
    }));
  const send = async () => {
    if (
      sending ||
      !app.access ||
      !app.branch ||
      !selectedTable ||
      !draft.lines.length
    )
      return;
    if (app.connection === "OFFLINE") {
      setMessage(
        "You're offline. This order is saved as a draft and has not reached the kitchen.",
      );
      return;
    }
    setSending(true);
    setMessage("Sending to kitchen…");
    const result = await supabase.rpc("mobile_waiter_order", {
      p_operation_id: draft.intentId,
      p_payload: {
        tableId: selectedTable.id,
        branchId: app.branch.id,
        notes: draft.notes,
        items: draft.lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          modifiers: line.choices.map((choice) => ({
            groupId: choice.groupId,
            optionId: choice.optionId,
          })),
        })),
      },
    });
    if (result.error)
      setMessage(
        /duplicate|already/i.test(result.error.message)
          ? "This table changed. Refresh it before sending."
          : "The order was not confirmed. Your draft remains available.",
      );
    else {
      setMessage(
        `Order ${String((result.data as { orderNumber?: string })?.orderNumber ?? "")} sent to kitchen.`,
      );
      const empty = {
        intentId: Crypto.randomUUID(),
        tableId: selectedTable.id,
        lines: [],
        notes: "",
        updatedAt: new Date().toISOString(),
      };
      setDraft(empty);
      await AsyncStorage.setItem(draftKey, JSON.stringify(empty));
      void load();
    }
    setSending(false);
  };
  const respond = async (
    request: ServiceRequest,
    action: "ACKNOWLEDGE" | "COMPLETE",
  ) => {
    if (!app.access || !app.branch) return;
    const payload = { p_request_id: request.id, p_action: action };
    if (app.connection === "OFFLINE") {
      await queueSafeOperation({
        id: `service:${request.id}:${action}`,
        businessId: app.access.businessId,
        branchId: app.branch.id,
        userId: app.access.userId,
        kind: "SERVICE_REQUEST_RESPONSE",
        payload,
      });
      setMessage(
        "Action queued. It is not confirmed until connection returns.",
      );
      return;
    }
    const result = await supabase.rpc(
      "respond_to_table_waiter_request",
      payload,
    );
    setMessage(
      result.error
        ? "Request changed elsewhere. Refresh and try again."
        : `Request ${action === "ACKNOWLEDGE" ? "acknowledged" : "resolved"}.`,
    );
    if (!result.error) void load();
  };
  if (!app.access || !app.branch)
    return (
      <OpsScreen>
        <OpsLoading />
      </OpsScreen>
    );
  return (
    <OpsScreen>
      <OpsHeader
        title="Waiter"
        subtitle={
          selectedTable
            ? `${selectedTable.name} · ${draft.lines.length} unsent item${draft.lines.length === 1 ? "" : "s"}`
            : "Choose a table to begin"
        }
        action={
          <Pressable
            accessibilityLabel="Sign out"
            onPress={() => void app.signOut()}
          >
            <LogOut color={opsColors.muted} size={22} />
          </Pressable>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        {[
          ["tables", "Tables"],
          [
            "menu",
            `Menu${draft.lines.length ? ` (${draft.lines.length})` : ""}`,
          ],
          [
            "requests",
            `Requests${requests.length ? ` (${requests.length})` : ""}`,
          ],
        ].map(([value, label]) => (
          <OpsButton
            key={value}
            compact
            tone={tab === value ? "primary" : "secondary"}
            title={label}
            onPress={() => setTab(value as typeof tab)}
          />
        ))}
      </ScrollView>
      {message ? (
        <OpsNotice
          tone={
            /not|could not|changed|offline/i.test(message) ? "error" : "success"
          }
        >
          {message}
        </OpsNotice>
      ) : null}
      {loading ? (
        <OpsLoading label="Refreshing tables and requests…" />
      ) : tab === "tables" ? (
        <>
          <OpsSection title="Floor" detail="Free and occupied tables" />
          {tables.length ? (
            <View style={[opsStyles.split, { paddingHorizontal: 10 }]}>
              {tables.map((table) => (
                <Pressable
                  key={table.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${table.name}, ${table.session_id ? "occupied" : "free"}`}
                  onPress={() => {
                    setDraft((current) => ({
                      ...current,
                      tableId: table.id,
                      updatedAt: new Date().toISOString(),
                    }));
                    setTab("menu");
                  }}
                  style={{
                    width: "47%",
                    minHeight: 112,
                    padding: 15,
                    borderRadius: 14,
                    borderWidth: table.id === draft.tableId ? 2 : 1,
                    borderColor:
                      table.id === draft.tableId
                        ? opsColors.brand
                        : opsColors.line,
                    backgroundColor: opsColors.paper,
                    justifyContent: "space-between",
                  }}
                >
                  <Utensils
                    color={
                      table.session_id ? opsColors.warning : opsColors.success
                    }
                    size={23}
                  />
                  <View>
                    <Text style={opsStyles.strong}>{table.name}</Text>
                    <Text style={opsStyles.muted}>
                      {table.session_id
                        ? `${table.order_number ?? "Open bill"} · ${money(table.total ?? 0)}`
                        : `${table.seats} seats · Free`}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <OpsEmpty
              title="No active tables"
              detail="Ask a manager to configure this branch's floor."
            />
          )}
        </>
      ) : tab === "menu" ? (
        <>
          <OpsSection
            title="Menu"
            detail={
              selectedTable
                ? `Adding to ${selectedTable.name}`
                : "Choose a table first"
            }
          />
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <OpsField
              label="Search menu"
              value={query}
              onChangeText={setQuery}
              placeholder="Product name"
            />
          </View>
          {filtered.map((product) => (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name}`}
              disabled={!selectedTable}
              onPress={() => openProduct(product)}
            >
              <OpsCard>
                <View style={opsStyles.row}>
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>{product.name}</Text>
                    <Text style={opsStyles.muted}>
                      {money(product.sale_price ?? product.base_price)}
                      {product.product_modifier_groups.length ||
                      product.product_variants.length
                        ? " · options"
                        : ""}
                    </Text>
                  </View>
                  <Plus
                    color={selectedTable ? opsColors.brand : opsColors.muted}
                    size={22}
                  />
                </View>
              </OpsCard>
            </Pressable>
          ))}
          {draft.lines.length ? (
            <OpsCard>
              <View style={opsStyles.row}>
                <ShoppingCart color={opsColors.brand} size={21} />
                <Text style={[opsStyles.strong, opsStyles.grow]}>
                  Unsent items
                </Text>
                <Text style={opsStyles.strong}>{money(total)}</Text>
              </View>
              {draft.lines.map((line) => (
                <View
                  key={line.id}
                  style={[
                    opsStyles.row,
                    {
                      paddingVertical: 9,
                      borderBottomWidth: 1,
                      borderBottomColor: opsColors.line,
                    },
                  ]}
                >
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>{line.name}</Text>
                    <Text style={opsStyles.muted}>
                      {[
                        line.variantName,
                        ...line.choices.map((choice) => choice.optionName),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Standard"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Decrease ${line.name}`}
                    onPress={() => quantity(line.id, -1)}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Minus size={18} color={opsColors.ink} />
                  </Pressable>
                  <Text style={opsStyles.strong}>{line.quantity}</Text>
                  <Pressable
                    accessibilityLabel={`Increase ${line.name}`}
                    onPress={() => quantity(line.id, 1)}
                    style={{
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Plus size={18} color={opsColors.ink} />
                  </Pressable>
                </View>
              ))}
              <OpsField
                label="Kitchen note"
                value={draft.notes}
                onChangeText={(notes) =>
                  setDraft((current) => ({
                    ...current,
                    notes: notes.slice(0, 500),
                    updatedAt: new Date().toISOString(),
                  }))
                }
                multiline
                maxLength={500}
              />
              <OpsButton
                title={
                  app.connection === "OFFLINE"
                    ? "Offline · Draft saved"
                    : sending
                      ? "Sending to kitchen…"
                      : "Send to kitchen"
                }
                disabled={app.connection === "OFFLINE" || sending}
                onPress={() => void send()}
              />
            </OpsCard>
          ) : null}
        </>
      ) : (
        <>
          <OpsSection
            title="Service requests"
            detail="Customer QR calls and bill requests"
          />
          {requests.length ? (
            requests.map((request) => (
              <OpsCard key={request.id}>
                <View style={opsStyles.row}>
                  <BellRing color={opsColors.warning} size={22} />
                  <View style={opsStyles.grow}>
                    <Text style={opsStyles.strong}>
                      {request.restaurant_tables?.name ?? "Table"}
                    </Text>
                    <Text style={opsStyles.muted}>
                      {(request.request_type ?? "CALL_WAITER").replaceAll(
                        "_",
                        " ",
                      )}{" "}
                      · {new Date(request.created_at).toLocaleTimeString()}
                    </Text>
                  </View>
                  <OpsStatus value={request.status} />
                </View>
                <View style={[opsStyles.row, { marginTop: 12 }]}>
                  {request.status === "PENDING" ? (
                    <OpsButton
                      compact
                      tone="secondary"
                      title="Acknowledge"
                      onPress={() => void respond(request, "ACKNOWLEDGE")}
                    />
                  ) : null}
                  <OpsButton
                    compact
                    title="Resolve"
                    onPress={() => void respond(request, "COMPLETE")}
                  />
                </View>
              </OpsCard>
            ))
          ) : (
            <OpsEmpty
              title="No requests"
              detail="There are no tables needing attention."
            />
          )}
        </>
      )}
      <Modal
        visible={Boolean(editing)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditing(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#0008",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              maxHeight: "82%",
              backgroundColor: opsColors.canvas,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingTop: 10,
            }}
          >
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              <OpsSection
                title={editing?.name ?? "Configure item"}
                detail={money(editing?.sale_price ?? editing?.base_price ?? 0)}
              />
              {editing?.product_variants
                .filter((item) => item.is_active)
                .map((variant) => (
                  <Pressable
                    key={variant.id}
                    onPress={() => setVariantId(variant.id)}
                  >
                    <OpsCard
                      style={{
                        borderColor:
                          variantId === variant.id
                            ? opsColors.brand
                            : opsColors.line,
                      }}
                    >
                      <View style={opsStyles.row}>
                        <Text style={[opsStyles.strong, opsStyles.grow]}>
                          {variant.name}
                        </Text>
                        <Text style={opsStyles.muted}>
                          {variant.price_adjustment
                            ? `+ ${money(variant.price_adjustment)}`
                            : "Included"}
                        </Text>
                      </View>
                    </OpsCard>
                  </Pressable>
                ))}
              {editing?.product_modifier_groups.map((link) => (
                <View key={link.modifier_groups.id}>
                  <OpsSection
                    title={link.modifier_groups.name}
                    detail={
                      link.modifier_groups.is_required ? "Required" : "Optional"
                    }
                  />
                  {link.modifier_groups.modifier_options
                    .filter((option) => option.is_active)
                    .map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() =>
                          toggleChoice(link.modifier_groups, option)
                        }
                      >
                        <OpsCard
                          style={{
                            borderColor: choices.some(
                              (item) => item.optionId === option.id,
                            )
                              ? opsColors.brand
                              : opsColors.line,
                          }}
                        >
                          <View style={opsStyles.row}>
                            <Text style={[opsStyles.strong, opsStyles.grow]}>
                              {option.name}
                            </Text>
                            <Text style={opsStyles.muted}>
                              {option.price_adjustment
                                ? `+ ${money(option.price_adjustment)}`
                                : "Included"}
                            </Text>
                          </View>
                        </OpsCard>
                      </Pressable>
                    ))}
                </View>
              ))}
              <View style={{ padding: 16, gap: 9 }}>
                <OpsButton title="Add to order" onPress={addConfigured} />
                <OpsButton
                  tone="secondary"
                  title="Cancel"
                  onPress={() => setEditing(null)}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </OpsScreen>
  );
}
