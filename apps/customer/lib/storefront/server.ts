import "server-only"

import { createClient } from "@supabase/supabase-js"
import { fallbackStorefront } from "@/lib/storefront/fallback"
import type { AreaGroupId, LocationArea, MenuSection, Product, ProductModifierGroup, StorefrontSnapshot } from "@/types"

type Row = Record<string, unknown>
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const first = (value: unknown): Row | null => Array.isArray(value) ? (value[0] as Row | undefined) ?? null : value && typeof value === "object" ? value as Row : null
const text = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const boolean = (value: unknown, fallback = false) => typeof value === "boolean" ? value : fallback
const safeHref = (value: string) => /^(https?:\/\/|\/(?!\/))/i.test(value) ? value : ""
const color = (value: unknown, fallback: string) => /^#[0-9a-fA-F]{6}$/.test(text(value)) ? text(value) : fallback
const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, number(value, fallback)))
const fontFamily = (value: unknown) => /^[a-zA-Z0-9 -]{1,80}$/.test(text(value)) ? text(value) : "Geist"
const fontStylesheetUrl = (value: unknown) => {
  const url = text(value)
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" && ["fonts.googleapis.com", "fonts.bunny.net"].includes(parsed.hostname) ? parsed.toString() : null
  } catch { return null }
}

function groupId(value: unknown): AreaGroupId {
  const label = text(value).toLowerCase()
  if (label.includes("reservoir") || label.includes("dam")) return "reservoir-side"
  if (label.includes("extended")) return "extended-belt"
  return "ghazi-nearby"
}

function databaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false }, global: { fetch: (input, init) => fetch(input, { ...init, cache:"no-store" }) } })
}

function branchIsOpen(branch: Row, timezone: string) {
  if (boolean(branch.temporarily_closed)) return false
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(new Date()).map((part) => [part.type, part.value]))
  const day = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.weekday)
  const rows = asRows(branch.business_hours)
  const row = rows.find((entry) => number(entry.day_of_week,-1) === day)
  const previous = rows.find((entry) => number(entry.day_of_week,-1) === (day + 6) % 7)
  const current = number(parts.hour) * 60 + number(parts.minute)
  const minutes = (value: unknown) => { const [hour, minute] = text(value).split(":").map(Number); return hour * 60 + minute }
  const isOpenAt = (entry: Row | undefined, includeStart: boolean) => {
    if (!entry || boolean(entry.is_closed)) return false
    const opens = minutes(entry.opens_at), closes = minutes(entry.closes_at)
    if (!Number.isFinite(opens) || !Number.isFinite(closes)) return false
    if (opens <= closes) return includeStart ? current >= opens && current <= closes : false
    return includeStart ? current >= opens : current <= closes
  }
  // A late-night schedule belongs to the previous business day after midnight.
  if (isOpenAt(row, true)) return true
  if (row && !boolean(row.is_closed) && minutes(row.opens_at) > minutes(row.closes_at) && current <= minutes(row.closes_at)) return true
  if (previous && !boolean(previous.is_closed) && minutes(previous.opens_at) > minutes(previous.closes_at) && current <= minutes(previous.closes_at)) return true
  return !row
}

function safeTimezone(value: string, fallback = "Asia/Karachi") {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value } catch { return fallback }
}

function formatClock(value: unknown) {
  const raw = text(value)
  const [hourRaw, minuteRaw] = raw.split(":").map(Number)
  if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return ""
  const hour = ((hourRaw % 24) + 24) % 24
  return `${hour % 12 || 12}:${String(minuteRaw).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`
}

function todayHoursLabel(branch: Row, timezone: string) {
  if (boolean(branch.temporarily_closed)) return "Temporarily closed"
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date())
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday)
  const row = asRows(branch.business_hours).find((entry) => number(entry.day_of_week, -1) === day)
  if (!row) return "Hours unavailable"
  if (boolean(row.is_closed) || !formatClock(row.opens_at) || !formatClock(row.closes_at)) return "Closed today"
  return `Open ${formatClock(row.opens_at)} – ${formatClock(row.closes_at)}`
}

export async function getStorefrontSnapshot(): Promise<StorefrontSnapshot> {
  const supabase = databaseClient()
  if (!supabase) return fallbackStorefront
  const unavailableStorefront: StorefrontSnapshot = {
    ...fallbackStorefront,
    orderPersistence:"unavailable",
    deliveryAreas:[],
    products:fallbackStorefront.products.map((product)=>({ ...product, available:false })),
    deals:fallbackStorefront.deals.map((deal)=>({ ...deal, available:false })),
  }
  try {
    const businessResult = await supabase.from("businesses").select("*,business_branding(*),site_settings(*),social_links(*),branches(*,business_hours(*),delivery_rules(*),delivery_areas(*))").eq("slug","italian-pizza").eq("is_active",true).limit(1).maybeSingle()
    if (businessResult.error || !businessResult.data) return unavailableStorefront
    const business = businessResult.data as Row
    const businessId = text(business.id)
    const [categoryResult, productResult, dealResult, bannerResult] = await Promise.all([
      supabase.from("categories").select("*").eq("business_id",businessId).eq("is_active",true).order("sort_order"),
      supabase.from("products").select("*,categories(name,slug),product_images(*),product_modifier_groups(sort_order,modifier_groups(*,modifier_options(*)))").eq("business_id",businessId).eq("is_active",true).order("sort_order"),
      supabase.from("deals").select("*").eq("business_id",businessId).eq("is_active",true).order("sort_order"),
      supabase.from("hero_banners").select("*").eq("business_id",businessId).eq("is_active",true).order("sort_order"),
    ])
    if (categoryResult.error || productResult.error || dealResult.error || bannerResult.error) return unavailableStorefront

    const branding = first(business.business_branding)
    const settings = first(business.site_settings)
    // CMS tables are introduced by a versioned migration. Keep the storefront
    // available during a rolling deploy if that migration has not reached the
    // read replica yet; the admin editor will populate them once available.
    const [footerLinksResult, contentPagesResult] = await Promise.all([
      supabase.from("footer_links").select("label,href,group_name,is_external,is_active,sort_order").eq("business_id", businessId).eq("is_active", true).order("sort_order"),
      supabase.from("content_pages").select("slug,title,body,is_published,sort_order").eq("business_id", businessId).eq("is_published", true).order("sort_order"),
    ])
    const branch = asRows(business.branches).filter((row) => boolean(row.is_active,true)).sort((a,b)=>number(a.sort_order)-number(b.sort_order))[0]
    if (!branch) return unavailableStorefront
    const rule = first(branch.delivery_rules)
    const timezone = safeTimezone(text(branch.timezone,text(business.timezone,"Asia/Karachi")), safeTimezone(text(business.timezone,"Asia/Karachi")))
    const branchCity = text(branch.city, text(business.city))
    const contextualText = (value: unknown, fallback = "") => text(value, fallback).replace(/Tarbela Ghazi/gi, branchCity)
    const branchOpen = branchIsOpen(branch, timezone)
    const branchTodayHours = todayHoursLabel(branch, timezone)
    const validOrigin = (value: { latitude: number; longitude: number } | null) => value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180 && !(value.latitude === 0 && value.longitude === 0) ? value : null
    const branchOrigin = branch.latitude != null && branch.longitude != null
      ? validOrigin({ latitude: Number(branch.latitude), longitude: Number(branch.longitude) })
      : null
    // The branch row is the single source of truth for routing. The legacy
    // delivery_rules origin is maintained as a compatibility mirror only and
    // must never silently resurrect a stale branch location.
    const origin = branchOrigin
    const acceptingOrders = branchOpen && boolean(branch.online_ordering_enabled,true)
    const areas: LocationArea[] = asRows(branch.delivery_areas).filter((row)=>boolean(row.is_active,true)&&text(row.city,branch.city as string).toLocaleLowerCase()===text(branch.city).toLocaleLowerCase()).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map((row)=>({id:text(row.slug),databaseId:text(row.id),label:text(row.name),aliases:Array.isArray(row.aliases)?row.aliases.map(String):[],group:groupId(row.group_name),parentId:row.parent_id == null ? null : text(row.parent_id),level:(text(row.level,"SUB_AREA") as LocationArea["level"]),city:text(row.city)||null,countryCode:text(row.country_code)||null,providerPlaceId:text(row.provider_place_id)||null,centerLatitude:row.center_lat==null?null:number(row.center_lat),centerLongitude:row.center_lng==null?null:number(row.center_lng),serviceRadiusMeters:row.service_radius_meters==null?null:number(row.service_radius_meters),boundaryGeojson:row.boundary_geojson??null,boundaryType:(text(row.boundary_type,"LOCALITY_MATCH") as LocationArea["boundaryType"])}))
    const categories: MenuSection[] = asRows(categoryResult.data).map((row)=>({id:text(row.slug),title:text(row.name),description:text(row.description)||undefined,descriptionBold:boolean(row.description_bold),bannerImage:text(row.section_banner_url)||undefined,categoryImage:text(row.image_url,"/images/categories/pizza-placeholder.svg"),productCategory:text(row.name),kind:text(row.slug)==="deals"?"deals":undefined}))
    const products: Product[] = asRows(productResult.data).map((row)=>{
      const category=first(row.categories)
      const images=asRows(row.product_images).sort((a,b)=>number(a.sort_order)-number(b.sort_order))
      const modifierGroups: ProductModifierGroup[]=asRows(row.product_modifier_groups).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).flatMap((assignment)=>{
        const group=first(assignment.modifier_groups);if(!group||!boolean(group.is_active,true))return []
        return [{id:text(group.id),label:text(group.name),selection:text(group.selection_type)==="MULTIPLE"?"multiple":"single",required:boolean(group.is_required),minSelections:number(group.min_selections),maxSelections:group.max_selections===null?null:number(group.max_selections),options:asRows(group.modifier_options).filter(option=>boolean(option.is_active,true)).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map(option=>({id:text(option.id),label:text(option.name),priceDelta:number(option.price_adjustment),image:text(option.image_url)||undefined,isDefault:boolean(option.is_default)}))}]
      })
      return {id:text(row.id),name:text(row.name),description:text(row.description),price:number(row.sale_price??row.base_price),oldPrice:row.old_price===null?undefined:number(row.old_price),category:text(category?.name),badge:(text(row.badge) as Product["badge"])||undefined,available:boolean(row.is_available,true),customizable:modifierGroups.length>0,image:text(images.find(image=>boolean(image.is_primary))?.url??images[0]?.url,"/images/products/pizza-placeholder.svg"),modifierGroups}
    })
    const now=Date.now()
    const activeWindow=(row:Row)=>{const starts=text(row.starts_at);const ends=text(row.ends_at);return(!starts||Date.parse(starts)<=now)&&(!ends||Date.parse(ends)>now)}
    return {
      source:"database",
      orderPersistence:"database",
      business:{id:businessId,name:text(branch.restaurant_name,text(business.name,"Restaurant")),displayName:text(branch.restaurant_name,text(branding?.display_name,text(business.name,"RESTAURANT")).toUpperCase()),description:contextualText(business.short_description),footerDescription:contextualText(branding?.footer_description,contextualText(business.short_description)),tagline:contextualText(settings?.tagline,contextualText(branding?.footer_description,contextualText(business.short_description))),contactText:text(settings?.contact_text),phone:text(business.phone)||null,email:text(business.email)||null,address:text(branch.formatted_address)||text(branch.address)||text(business.address)||null,city:branchCity,currency:"PKR",timezone,logoUrl:text(branding?.logo_url)||null,footerLogoUrl:text(branding?.footer_logo_url)||null,appStoreUrl:/^https:\/\/apps\.apple\.com\//i.test(text(settings?.app_store_url))?text(settings?.app_store_url):null,playStoreUrl:/^https:\/\/play\.google\.com\//i.test(text(settings?.play_store_url))?text(settings?.play_store_url):null,faviconUrl:text(branding?.favicon_url)||null,primaryColor:color(branding?.primary_color,"#a92114"),secondaryColor:color(branding?.secondary_color,"#e7a81a"),websiteBackgroundColor:color(branding?.website_background_color,"#fbf7f2"),headerBackgroundColor:color(branding?.header_background_color,"#ffffff"),footerBackgroundColor:color(branding?.footer_background_color,"#211d1b"),productCardBackgroundColor:color(branding?.product_card_background_color,"#ffffff"),textColor:color(branding?.text_color,"#211d1b"),footerTextColor:color(branding?.footer_text_color,"#f7f2ee"),fontFamily:fontFamily(branding?.font_family),fontStylesheetUrl:fontStylesheetUrl(branding?.font_stylesheet_url),headerLogoSizePx:boundedNumber(branding?.header_logo_size_px,56,36,120),footerLogoSizePx:boundedNumber(branding?.footer_logo_size_px,88,40,180),announcementEnabled:boolean(settings?.announcement_enabled,true),announcementText:contextualText(settings?.announcement_text),reviewsEnabled:boolean(settings?.reviews_enabled,true),reviewsTitle:text(settings?.reviews_title,"Google Reviews"),reviewsBusinessName:text(settings?.reviews_business_name)||null,reviewsWidgetId:text(settings?.reviews_widget_id)||null,whatsappFloatingEnabled:boolean(settings?.whatsapp_floating_enabled,false),whatsappNumber:text(settings?.whatsapp_floating_number).replace(/\D/g,""),whatsappLogoUrl:text(settings?.whatsapp_floating_logo_url)||null,whatsappMessage:text(settings?.whatsapp_floating_message,"Hello, I would like to place an order."),whatsappSide:text(settings?.whatsapp_floating_side)==="RIGHT"?"RIGHT":"LEFT",whatsappSizePx:boundedNumber(settings?.whatsapp_floating_size_px,58,44,96),whatsappBottomPx:boundedNumber(settings?.whatsapp_floating_bottom_px,24,8,240),whatsappSideOffsetPx:boundedNumber(settings?.whatsapp_floating_side_offset_px,24,8,160),socialLinks:asRows(business.social_links).filter((row)=>boolean(row.is_active,true)).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map((row)=>({platform:text(row.platform),url:text(row.url)})),footerLinks:asRows(footerLinksResult.data).filter((row)=>boolean(row.is_active,true)).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map((row)=>({label:text(row.label),href:safeHref(text(row.href)),group:text(row.group_name,"QUICK_LINKS"),isExternal:boolean(row.is_external)})).filter((row)=>row.label&&row.href),contentPages:asRows(contentPagesResult.data).filter((row)=>boolean(row.is_published,true)).sort((a,b)=>number(a.sort_order)-number(b.sort_order)).map((row)=>({slug:text(row.slug),title:text(row.title),body:text(row.body)})).filter((row)=>row.slug&&row.title)},
      branch:{id:text(branch.id),name:text(branch.name),restaurantName:text(branch.restaurant_name)||null,locationRevision:number(branch.location_revision,1),city:branchCity,countryCode:text(branch.country_code)||null,region:text(branch.region)||null,formattedAddress:text(branch.formatted_address)||text(branch.address)||null,timezone:text(branch.timezone,timezone),temporarilyClosed:boolean(branch.temporarily_closed),isOpen:acceptingOrders,pickupEnabled:boolean(branch.pickup_enabled,true),deliveryEnabled:boolean(branch.delivery_enabled,true),freeDistanceKm:number(rule?.free_distance_km,5),extraKmRate:number(rule?.extra_km_rate,100),maximumDistanceKm:rule?.maximum_distance_km==null?null:number(rule.maximum_distance_km),originLatitude:origin?.latitude ?? null,originLongitude:origin?.longitude ?? null,todayHoursLabel:branchTodayHours},
      heroSlides:asRows(bannerResult.data).filter(activeWindow).map(row=>({id:text(row.id),image:text(row.image_url),mobileImage:text(row.mobile_image_url)||undefined,alt:text(row.alt_text,`${text(branch.restaurant_name,text(business.name))} promotion`)})),
      heroSettings:{autoplay:boolean(branding?.hero_autoplay,true),intervalMs:Math.min(15000,Math.max(3000,number(branding?.hero_interval_ms,5500))),transitionMs:([350,500,650].includes(number(branding?.hero_transition_ms,650))?number(branding?.hero_transition_ms,650):650) as 350|500|650},
      menuSections:categories,
      products,
      deals:asRows(dealResult.data).filter(activeWindow).map(row=>({id:text(row.id),name:text(row.name),description:text(row.description),price:number(row.deal_price),savings:Math.max(0,number(row.old_price)-number(row.deal_price)),image:text(row.image_url,"/images/products/deal-placeholder.svg"),available:true})),
      deliveryAreas:areas,
    }
  } catch {
    return unavailableStorefront
  }
}

