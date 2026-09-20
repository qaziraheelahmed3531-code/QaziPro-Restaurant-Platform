"use client"

import { CartDrawer } from "@/components/cart/cart-drawer"
import { LocationDialog } from "@/components/location/location-dialog"
import { CustomizationDialog } from "@/components/product/customization-dialog"
import { LoyaltyWelcome } from "@/components/loyalty/loyalty-welcome"
import { FloatingWhatsApp } from "@/components/layout/floating-whatsapp"
import { useApp } from "@/components/providers/app-provider"

export function AppOverlays() {
  const app = useApp()
  if(!app.hydrated)return <div className="location-boot-guard" role="status" aria-label="Loading your ordering location"><span/><p>Preparing your ordering location…</p></div>
  return (
    <>
      <LocationDialog
        open={app.locationOpen}
        orderType={app.orderType}
        selectedAreaId={app.selectedAreaId}
        onClose={app.closeLocation}
        mandatory={app.locationRequired}
        onPickupSelect={app.confirmPickup}
        onOrderTypeChange={app.setOrderType}
        onAreaSelect={app.selectArea}
        areas={app.storefront.deliveryAreas}
        business={app.storefront.business}
        branch={app.storefront.branch}
      />
      <CustomizationDialog products={app.storefront.products} productId={app.productId} onClose={app.closeProduct} onAdd={app.addCartLine} />
      <CartDrawer />
      <LoyaltyWelcome />
      <FloatingWhatsApp business={app.storefront.business} />
    </>
  )
}
