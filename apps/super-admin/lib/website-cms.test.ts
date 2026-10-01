import { describe,expect,it } from "vitest"
import { aboutContentSchema } from "./website-cms"

const original={eyebrow:"About QaziPro",title:"Connected operations",story:"Software for restaurant teams.",mission:"Keep operations clear."}
describe("About CMS content",()=>{
  it("accepts existing documents and supplies optional field defaults",()=>{
    const value=aboutContentSchema.parse(original)
    expect(value.ctaHref).toBe("/contact")
    expect(value.vision).toBe("")
  })
  it("preserves unrelated existing content fields",()=>{
    expect(aboutContentSchema.parse({...original,existingContent:"keep"}).existingContent).toBe("keep")
  })
  it.each(["javascript:alert(1)","//evil.example","https://evil.example","/admin",""])("rejects unsupported CTA %s",ctaHref=>{
    expect(aboutContentSchema.safeParse({...original,ctaHref}).success).toBe(false)
  })
  it("rejects blank headline, oversized story and non-text values",()=>{
    for(const change of [{title:" "},{story:"x".repeat(5001)},{mission:{html:"test"}}])expect(aboutContentSchema.safeParse({...original,...change}).success).toBe(false)
  })
  it("accepts all supported destinations",()=>{
    for(const ctaHref of ["/contact","/book-a-demo","/client-onboarding","/restaurant-platform"])expect(aboutContentSchema.safeParse({...original,ctaHref}).success).toBe(true)
  })
})
