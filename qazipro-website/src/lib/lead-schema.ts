import { z } from "zod";

export const leadKinds = ["CONTACT", "DEMO", "QUOTE", "ONBOARDING"] as const;
export const branchBands = ["ONE", "TWO_TO_FIVE", "SIX_PLUS"] as const;
export const serviceKeys = ["RESTAURANT_POS", "ONLINE_ORDERING", "WEBSITE", "ANDROID", "IOS", "INVENTORY", "KITCHEN", "MULTI_BRANCH", "SHOPIFY", "SHOPIFY_THEME", "FULL_STACK", "OTHER"] as const;

export const leadSchema = z.object({
  kind: z.enum(leadKinds),
  fullName: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().regex(/^[+\d][\d\s()+.-]{6,34}$/),
  branchBand: z.enum(branchBands).default("ONE"),
  services: z.array(z.enum(serviceKeys)).max(12).default([]),
  message: z.string().trim().max(3000).default(""),
  preferredContactTime: z.string().trim().max(120).default(""),
  preferredContactMethod: z.enum(["EMAIL", "PHONE", "WHATSAPP"]).default("WHATSAPP"),
  budgetRange: z.string().trim().max(120).default(""),
  sourcePage: z.string().trim().regex(/^\/[a-z0-9\/-]*$/).max(120),
  website: z.string().max(200).default(""),
  startedAt: z.number().int().positive().optional(),
  utmSource: z.string().trim().max(100).default(""),
  utmMedium: z.string().trim().max(100).default(""),
  utmCampaign: z.string().trim().max(100).default(""),
});

export type LeadInput = z.infer<typeof leadSchema>;
