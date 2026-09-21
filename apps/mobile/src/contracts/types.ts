import type { MobileRestaurantBootstrap } from "@italian-pizza/shared/mobile-api";

export type Bootstrap = MobileRestaurantBootstrap;
export type Branch = Bootstrap["branches"][number];
export type ModifierOption = {
  id: string;
  label: string;
  priceDelta: number;
  available?: boolean;
  isDefault?: boolean;
};
export type ModifierGroup = {
  id: string;
  label: string;
  selection: "single" | "multiple";
  required: boolean;
  minSelections: number;
  maxSelections: number | null;
  options: ModifierOption[];
};
export type Variant = {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  available?: boolean;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  oldPrice?: number;
  category: string;
  available: boolean;
  customizable?: boolean;
  image: string;
  tags?: string[];
  variants?: Variant[];
  modifierGroups?: ModifierGroup[];
};
export type MenuSection = {
  id: string;
  title: string;
  description?: string;
  categoryImage?: string;
  productCategory?: string;
  kind?: "products" | "deals";
};
export type Deal = {
  id: string;
  name: string;
  description: string;
  price: number;
  savings: number;
  image: string;
  available?: boolean;
};
export type Catalog = {
  restaurantKey: string;
  branchId: string;
  heroSlides: {
    id: string;
    image: string;
    mobileImage?: string;
    alt: string;
  }[];
  heroSettings: {
    autoplay: boolean;
    intervalMs: number;
    transitionMs: 350 | 500 | 650;
  };
  menuSections: MenuSection[];
  products: Product[];
  deals: Deal[];
};
export type CartModifier = {
  groupId: string;
  optionId: string;
  label: string;
  priceDelta: number;
};
export type CartLine = {
  lineId: string;
  itemKind: "product" | "deal";
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  image: string;
  unitEstimate: number;
  quantity: number;
  modifiers: CartModifier[];
};
export type Cart = {
  restaurantKey: string;
  branchId: string;
  lines: CartLine[];
  promoCode?: string;
  loyaltyCoins: number;
  updatedAt: string;
};
export type Address = {
  id: string;
  branchId: string;
  label: "home" | "work" | "other";
  city: string;
  areaId: string | null;
  deliveryAreaId: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  instructions?: string;
  isDefault: boolean;
  coordinates: { latitude: number; longitude: number; source?: string } | null;
  createdAt: string;
};
export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  gender: string | null;
  date_of_birth: string | null;
};
export type LoyaltyWallet = {
  enabled: boolean;
  programName: string;
  coinName: string;
  coinValuePkr: number;
  redemptionEnabled?: boolean;
  minimumRedeemCoins?: number;
  maxRedeemPercent?: number;
  balanceCoins: number;
  balancePkr: number;
  tier: string;
  transactions: {
    id: string;
    transaction_type: string;
    coins: number;
    description: string;
    created_at: string;
  }[];
};
export type PaymentCapabilities = {
  methods: { id: string; label: string; enabled: boolean }[];
  onlineGateway: null | { id: string; label: string };
};
export type Promotion = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maximumDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
};
export type PublicOrder = Record<string, unknown> & {
  id?: string;
  orderNumber?: string;
  order_number?: string;
  status?: string;
  total?: number;
  serviceMode?: string;
  service_mode?: string;
  guestTrackingToken?: string;
  created_at?: string;
};
export type OrderDetail = {
  order: PublicOrder;
  reorder: {
    branchId: string;
    serviceMode: "DELIVERY" | "PICKUP";
    items: {
      itemKind: "product" | "deal";
      productId: string;
      variantId?: string;
      quantity: number;
      modifiers: { groupId: string; optionId: string }[];
    }[];
  };
};
export type DeliveryArea = {
  id: string;
  databaseId: string;
  label: string;
  city?: string;
};
export type StorefrontContext = {
  business: { name: string; currency: string };
  branch: {
    id: string;
    name: string;
    city: string;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
  };
  deliveryAreas: DeliveryArea[];
};
export type CheckoutPayload = {
  idempotencyKey: string;
  branchId: string;
  serviceMode: "DELIVERY" | "PICKUP";
  paymentMethod: "CASH_ON_DELIVERY";
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAreaId?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  locationSource?: string;
  latitude?: number;
  longitude?: number;
  promoCode?: string;
  loyaltyCoinsToRedeem: number;
  items: {
    itemKind: "product" | "deal";
    productId: string;
    variantId?: string;
    quantity: number;
    modifiers: { groupId: string; optionId: string }[];
  }[];
};
