export type ModifierOption = {
  imageUrl?: string | null;
  imageDataUrl?: string | null;
  id: string;
  name: string;
  price: number;
  isDefault: boolean;
};
export type KitchenTicket={width:58|80;title:string;branch:string;reference:string;notes:string;lines:Array<{quantity:number;name:string;details:string[]}>};
export type KitchenPrintJob={id:string;branchId:string;orderId:string;deviceName:string;ticket:KitchenTicket;state:"QUEUED"|"PRINTING"|"SUBMITTED"|"CANCELLED"|"FAILED"|"UNKNOWN";message:string;createdAt:string;updatedAt:string};
export type ModifierGroup = {
  id: string;
  name: string;
  selection: "SINGLE" | "MULTIPLE";
  required: boolean;
  min: number;
  max: number | null;
  options: ModifierOption[];
};
export type CatalogProduct = {
  id: string;
  categoryId: string;
  posSectionId?: string | null;
  name: string;
  sku: string | null;
  price: number;
  imageUrl: string | null;
  imageDataUrl: string | null;
  groups: ModifierGroup[];
  variants: Array<{id:string;name:string;price:number;isDefault:boolean}>;
};
export type CatalogDeal = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  imageDataUrl: string | null;
};
export type PosPaymentMethod = {
  id: string;
  code: string;
  name: string;
  kind: "CASH" | "WALLET" | "CARD" | "OTHER";
  requiresReference: boolean;
  sortOrder: number;
};
export type CatalogSnapshot = {
  branchId: string;
  businessId: string;
  catalogVersionId: string;
  taxRateBps?:number;
  branchName: string;
  city: string;
  businessAddress?: string | null;
  businessName: string;
  logoUrl: string | null;
  logoDataUrl: string | null;
  faviconUrl: string | null;
  faviconDataUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  replacementWindowMinutes: number;
  recentOrderLimit: number;
  desktopOrderSound: boolean;
  orderNotificationSoundUrl: string | null;
  orderNotificationSoundDataUrl: string | null;
  paymentMethods: PosPaymentMethod[];
  posSections?: Array<{ id: string; name: string; color: string }>;
  categories: Array<{ id: string; name: string }>;
  products: CatalogProduct[];
  deals: CatalogDeal[];
  receiptSettings?: {
    width: 58 | 80;
    copies: number;
    includeKitchen: boolean;
    kitchenPrices: boolean;
    footer: string;
    note: string | null;
    phone: string | null;
    logoSize: number;
    logoAlignment: "LEFT" | "CENTER" | "RIGHT";
    headerAlignment: "LEFT" | "CENTER" | "RIGHT";
    showLogo: boolean;
    showPhone: boolean;
    showAddress: boolean;
    showTax: boolean;
    showCustomerAddress: boolean;
    showPaymentStatus: boolean;
    showBranchName: boolean;
    showOrderNumber: boolean;
    showToken: boolean;
    showOrderDate: boolean;
    showOrderType: boolean;
    showCustomerName: boolean;
    showCustomerPhone: boolean;
    showPaymentMethod: boolean;
  };
  updatedAt: string;
};
export type CartSelection = {
  groupId: string;
  optionId: string;
  groupName: string;
  optionName: string;
  price: number;
};
export type CartLine = {
  lineId: string;
  itemKind: "product" | "deal";
  productId: string;
  name: string;
  unitBasePrice: number;
  quantity: number;
  selections: CartSelection[];
  variantId?: string;
  variantName?: string;
};
export type LocalShift = {
  id: string;
  branchId: string;
  openingCash: number;
  openedAt: string;
  closedAt: string | null;
  countedCash: number | null;
  status: "OPEN" | "CLOSED";
  syncedAt: string | null;
  revision?: number;
  syncedRevision?: number;
  serverId?: string;
  syncError?: string | null;
  syncRetryAt?: string | null;
  syncNeedsAttention?: boolean;
  syncAttempts?: number;
  cashMovements?: Array<{id:string;type:"CASH_IN"|"CASH_OUT";amount:number;reason:string;createdAt:string}>;
};
export type LocalOrder = {
  id: string;
  branchId: string;
  catalogVersionId?: string;
  shiftId: string;
  localNumber: string;
  tokenNumber: number;
  businessDate: string;
  soldAt: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  orderType: "TAKEAWAY" | "DINE_IN";
  tableReference: string;
  cashReceived: number;
  paymentMethodCode?: string;
  paymentMethodName?: string;
  paymentReference?: string;
  operationalStatus?:
    "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";
  subtotal: number;
  tax?:number;
  total: number;
  items: CartLine[];
  syncState: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  syncAttempts?: number;
  syncStartedAt?: string | null;
  syncRetryAt?: string | null;
  syncNeedsAttention?: boolean;
  revision?: number;
  syncError: string | null;
  serverOrderId: string | null;
  serverOrderNumber: string | null;
  syncedAt: string | null;
  replacement: null | {
    reason: string;
    oldItems: CartLine[];
    oldTotal: number;
    createdAt: string;
  };
};
export type HeldOrder = {
  id: string;
  // Legacy unscoped holds remain stored, but are never guessed into a branch.
  branchId?: string;
  userId?: string;
  label: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  notes: string;
  orderType: "TAKEAWAY" | "DINE_IN";
  tableReference: string;
  items: CartLine[];
};
export type DesktopDraft = {
  key:string;branchId:string;userId:string;intentId:string;items:CartLine[];
  customerName:string;customerPhone:string;notes:string;orderType:"TAKEAWAY"|"DINE_IN";tableReference:string;
  heldId:string|null;updatedAt:string;
};

export type WebsiteOrderStatus =
  | "RECEIVED"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";
export type WebsiteOrder = {
  id: string;
  order_number: string;
  token_number: number;
  service_mode: "DELIVERY" | "PICKUP" | "DINE_IN";
  operational_order_type: string | null;
  status: WebsiteOrderStatus;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_area_name: string | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  order_notes: string | null;
  table_reference: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  updated_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_base_price: number;
    unit_modifier_price: number;
    unit_price: number;
    line_total: number;
    order_item_modifiers: Array<{
      group_name: string;
      option_name: string;
      price_adjustment: number;
    }>;
  }>;
};
