import type { Metadata,Viewport } from "next"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { WhatsappLink } from "@/components/whatsapp-link"
import { Analytics } from "@/components/analytics"
import { MotionSystem } from "@/components/motion-system"
import { site } from "@/lib/site"
import { getPublishedDocument } from "@/lib/platform-cms"
import "./globals.css"
import "./deep-recovery.css"

// Signed revalidation is immediate; bounded ISR also keeps CMS content fresh
// when a deployment has not configured its revalidation webhook yet.
export const revalidate = 60

export async function generateMetadata():Promise<Metadata>{
  const seo=await getPublishedDocument("seo",{defaultTitle:"QaziPro — Restaurant Technology & Custom Software",defaultDescription:"Connected restaurant systems for ordering, POS, kitchen, delivery and staff operations."})
  const title=String(seo.defaultTitle),description=String(seo.defaultDescription)
  return {metadataBase:new URL(site.url),title:{default:title,template:"%s | QaziPro"},description,applicationName:"QaziPro",category:"technology",creator:"QaziPro",publisher:"QaziPro",openGraph:{type:"website",siteName:"QaziPro",title,description},twitter:{card:"summary_large_image",title,description},robots:process.env.APP_ENVIRONMENT==="production"?{index:true,follow:true}:{index:false,follow:false}}
}

export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#f7f7f2"}

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  const organization={"@context":"https://schema.org","@type":"Organization",name:"QaziPro",url:site.url,founder:{"@type":"Person",name:"Qazi Raheel Ahmad"},email:site.email,telephone:site.phone,contactPoint:{"@type":"ContactPoint",telephone:site.phone,contactType:"sales and support",availableLanguage:["English","Urdu"]}}
  return <html lang="en" data-scroll-behavior="smooth"><body><a className="skip-link" href="#main">Skip to content</a><MotionSystem/><SiteHeader/><main id="main">{children}</main><SiteFooter/><WhatsappLink/><Analytics/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(organization).replace(/</g,"\\u003c")}}/>{process.env.NODE_ENV==="development"?<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async/>:null}</body></html>
}
