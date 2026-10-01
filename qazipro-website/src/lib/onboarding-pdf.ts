import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { OnboardingDefinition } from "@/lib/onboarding"

type PdfInput = {
  reference: string
  formVersion: number
  submittedAt: string
  values: Record<string,string>
  definition: OnboardingDefinition
  serviceIds: string[]
  packageId: string | null
  pricing: { currency:string; monthly:number; setup:number; locationFee:number; hasQuotedPrice:boolean }
  signatureData: string
  consentText: string
}

function wrapped(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = []
  let line = ""
  for (const word of text.replace(/\s+/g," ").trim().split(" ")) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate,size) <= width) line = candidate
    else { if (line) result.push(line); line = word }
  }
  if (line) result.push(line)
  return result.length ? result : [""]
}

export async function createOnboardingPdf(input: PdfInput) {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595.28,841.89])
  let y = 790
  const margin = 50
  const width = 495

  const ensure = (needed=42) => {
    if (y-needed > 45) return
    page = doc.addPage([595.28,841.89]); y=790
  }
  const line = (text:string,size=10,font:PDFFont=regular,color=rgb(.16,.18,.22),gap=5) => {
    const lines = wrapped(text,font,size,width)
    ensure(lines.length*(size+gap)+8)
    for (const item of lines) { page.drawText(item,{x:margin,y,size,font,color}); y-=size+gap }
  }
  const heading = (text:string) => { ensure(50); y-=9; line(text.toUpperCase(),11,bold,rgb(.34,.12,.67),7); page.drawLine({start:{x:margin,y:y+6},end:{x:margin+width,y:y+6},thickness:.7,color:rgb(.84,.82,.87)}); y-=5 }

  page.drawRectangle({x:0,y:806,width:595.28,height:35,color:rgb(.34,.12,.67)})
  try {
    const logo=await doc.embedPng(await readFile(path.join(process.cwd(),"public","brand","qazipro-mark-clean.png")))
    const scale=Math.min(62/logo.width,24/logo.height)
    page.drawImage(logo,{x:margin,y:811,width:logo.width*scale,height:logo.height*scale})
  } catch { page.drawText("QaziPro",{x:margin,y:817,size:15,font:bold,color:rgb(1,1,1)}) }
  line("CLIENT ONBOARDING AGREEMENT",20,bold,rgb(.1,.11,.14),9)
  line(`Reference: ${input.reference}  |  Form version: ${input.formVersion}  |  Submitted: ${new Date(input.submittedAt).toLocaleString("en-PK",{timeZone:"Asia/Karachi"})}`,8,regular,rgb(.38,.4,.45),6)
  line("Status: NEW (submitted for QaziPro review)",8,bold,rgb(.34,.12,.67),6)

  heading("Client information")
  for (const field of input.definition.fields.filter(item => item.enabled).sort((a,b)=>a.order-b.order)) {
    const value = input.values[field.id]
    if (value) line(`${field.label}: ${value}`,10,field.system ? bold : regular)
  }

  heading("Selected services")
  const services = input.definition.services.filter(item => input.serviceIds.includes(item.id))
  if (services.length) services.forEach(item => line(`• ${item.name}${item.description ? ` — ${item.description}` : ""}`))
  else line("No individual service selected.")

  heading("Package and pricing snapshot")
  const selectedPackage = input.definition.packages.find(item => item.id === input.packageId)
  line(`Package: ${selectedPackage?.name ?? "Custom quote"}`,10,bold)
  if (input.pricing.hasQuotedPrice) {
    line(`Monthly: ${input.pricing.currency} ${input.pricing.monthly.toLocaleString("en-PK")}`)
    line(`Setup: ${input.pricing.currency} ${input.pricing.setup.toLocaleString("en-PK")}`)
    line(`Location fees: ${input.pricing.currency} ${input.pricing.locationFee.toLocaleString("en-PK")}`)
  } else line("Pricing: Contact Sales / Custom Quote. No price was represented as agreed at submission.")

  heading("Terms snapshot")
  input.definition.terms.filter(item=>item.active).sort((a,b)=>a.order-b.order).forEach(item=>line(`• ${item.text}`,9))

  heading("Consent and signature")
  line(input.consentText,9)
  const signatureMatch = /^data:image\/png;base64,(.+)$/.exec(input.signatureData)
  if (signatureMatch) {
    try {
      const signature = await doc.embedPng(Buffer.from(signatureMatch[1],"base64"))
      const dimensions = signature.scale(Math.min(1,180/signature.width,70/signature.height))
      ensure(dimensions.height+28)
      page.drawImage(signature,{x:margin,y:y-dimensions.height,width:dimensions.width,height:dimensions.height})
      y-=dimensions.height+8
    } catch { line("Signature captured; image rendering unavailable in this copy.",9) }
  }
  line(`Signed electronically on ${new Date(input.submittedAt).toISOString()}`,8,regular,rgb(.38,.4,.45))
  line("This document records the submitted snapshot. It is not represented as a certified digital signature.",8,regular,rgb(.38,.4,.45))

  const pages = doc.getPages()
  pages.forEach((item,index) => item.drawText(`QaziPro • ${input.reference} • Page ${index+1} of ${pages.length}`,{x:margin,y:24,size:7,font:regular,color:rgb(.45,.46,.5)}))
  return doc.save({ useObjectStreams:false })
}
