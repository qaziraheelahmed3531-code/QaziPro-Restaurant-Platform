import { z } from "zod"

const itemId=z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)
const fee=z.number().int().min(0).nullable()
export const formDefinitionSchema=z.object({
  title:z.string().trim().min(2).max(120),intro:z.string().trim().min(2).max(1000),
  sections:z.array(z.object({id:itemId,title:z.string().trim().min(2).max(100),enabled:z.boolean(),order:z.number().int().optional()})).max(20),
  fields:z.array(z.object({id:z.string().regex(/^[a-z][a-zA-Z0-9_-]{1,63}$/),label:z.string().trim().min(2).max(100),placeholder:z.string().max(160).optional().default(""),type:z.enum(["text","email","phone","number","textarea","select","radio","checkbox","date"]),required:z.boolean(),system:z.boolean().default(false),enabled:z.boolean(),order:z.number().int().min(0).max(1000),options:z.array(z.string().min(1).max(80)).max(30).optional().default([])})).min(2).max(80),
  services:z.array(z.object({id:itemId,name:z.string().trim().min(2).max(100),description:z.string().max(500).default(""),monthlyFee:fee.optional().default(null),setupFee:fee.optional().default(null),perLocationFee:fee.optional().default(null),percentageFee:z.number().min(0).max(100).nullable().optional().default(null),active:z.boolean(),order:z.number().int().min(0).max(1000)})).max(80),
  packages:z.array(z.object({id:itemId,name:z.string().trim().min(2).max(100),description:z.string().max(500).default(""),currency:z.string().regex(/^[A-Z]{3}$/),monthlyFee:fee,setupFee:fee,perLocationFee:fee,serviceIds:z.array(itemId).max(50),notes:z.string().max(1000).optional().default(""),active:z.boolean(),order:z.number().int().min(0).max(1000)})).max(40),
  terms:z.array(z.object({id:itemId,text:z.string().trim().min(2).max(2000),active:z.boolean(),order:z.number().int().min(0).max(1000)})).max(80),
  consentText:z.string().trim().min(10).max(1000),
})
export type FormDefinition=z.infer<typeof formDefinitionSchema>

export function safeObject(value:string) {
  const parsed=JSON.parse(value) as unknown
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Content must be a JSON object.")
  return parsed as Record<string,unknown>
}
