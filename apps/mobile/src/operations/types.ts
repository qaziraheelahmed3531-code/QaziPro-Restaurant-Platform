export type OperationsRole =
  "OWNER" | "MANAGER" | "CASHIER" | "KITCHEN" | "WAITER" | "RIDER" | "STAFF";

export type OperationsBranch = {
  id: string;
  name: string;
  restaurant_name: string | null;
  city: string;
  formatted_address: string | null;
  phone: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
};

export type OperationsAccess = {
  userId: string;
  email: string;
  businessId: string;
  businessName: string;
  role: OperationsRole;
  permissions: string[];
  capabilities: Record<string, boolean>;
  branches: OperationsBranch[];
  primaryColor: string;
  logoUrl: string | null;
};

export type ConnectionState =
  "ONLINE" | "DEGRADED" | "OFFLINE" | "RECONNECTING" | "SYNCING";

export type SafeOperation = {
  id: string;
  businessId: string;
  branchId: string;
  userId: string;
  kind: "SERVICE_REQUEST_RESPONSE";
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  state: "QUEUED" | "SYNCING" | "NEEDS_ATTENTION";
  lastError?: string;
};

export type WaiterTable = {
  id: string;
  code: string;
  name: string;
  seats: number;
  session_id: string | null;
  order_id: string | null;
  order_number: string | null;
  total: number | null;
  order_status: string | null;
  payment_status: string | null;
};

export type RiderOrder = {
  id: string;
  order_number: string;
  token_number: number;
  customer_name: string;
  customer_phone: string;
  delivery_area_name: string | null;
  delivery_address: string;
  delivery_instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  total: number;
  payment_method: string;
  payment_status: string;
  items: { name: string; quantity: number }[];
};
