import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET() {
  const storefront=await getStorefrontSnapshot()
  return Response.json({
    name:storefront.business.displayName||storefront.business.name,
    logoUrl:storefront.business.logoUrl,
    primaryColor:storefront.business.primaryColor,
    secondaryColor:storefront.business.secondaryColor,
    backgroundColor:storefront.business.websiteBackgroundColor,
    headerColor:storefront.business.headerBackgroundColor,
    textColor:storefront.business.textColor,
  },{headers:{"Access-Control-Allow-Origin":"*","Cache-Control":"no-store"}})
}
