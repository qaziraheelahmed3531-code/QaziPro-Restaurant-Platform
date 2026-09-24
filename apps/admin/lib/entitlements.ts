export const runtimeCapabilityKeys = [
  "admin.restaurant","pos.web","pos.desktop","inventory","kitchen","waiter","rider",
  "website.ordering","ordering.delivery","ordering.pickup","loyalty","reports.advanced",
  "mobile.android","mobile.ios",
] as const

export type RuntimeCapabilityKey=(typeof runtimeCapabilityKeys)[number]

export function capabilitiesForPermission(permission:string): RuntimeCapabilityKey[] {
  if(permission==="waiter.use")return["waiter"]
  if(permission==="rider.use")return["rider"]
  if(permission==="kds.use")return["kitchen"]
  if(permission==="pos.use")return["pos.web"]
  if(permission==="desktop_pos.use")return["pos.desktop"]
  if(permission==="loyalty.manage")return["loyalty"]
  if(permission==="reports.read")return["reports.advanced"]
  if(permission.startsWith("inventory.")||["ingredients.manage","recipes.manage","purchases.manage","suppliers.manage","wastage.manage"].includes(permission))return["inventory"]
  if(["orders.read","orders.manage","notifications.read"].includes(permission))return["admin.restaurant","pos.web","pos.desktop","kitchen","waiter","rider"]
  if(["register.manage","receipts.print"].includes(permission))return["pos.web","pos.desktop"]
  return["admin.restaurant"]
}

export function entitlementAllows(capabilities:Record<string,boolean>,permission:string) {
  return capabilitiesForPermission(permission).some(capability=>capabilities[capability])
}
