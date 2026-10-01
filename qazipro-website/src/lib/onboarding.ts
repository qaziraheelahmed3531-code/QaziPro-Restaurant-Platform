import { z } from "zod"

export const fieldTypes = ["text", "email", "phone", "number", "textarea", "select", "radio", "checkbox", "date"] as const

export const onboardingFieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-zA-Z0-9_-]{1,63}$/),
  label: z.string().trim().min(2).max(100),
  placeholder: z.string().trim().max(160).optional().default(""),
  type: z.enum(fieldTypes),
  required: z.boolean().default(false),
  system: z.boolean().default(false),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).max(1000),
  options: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
})

export const onboardingServiceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  monthlyFee: z.number().int().min(0).nullable().optional().default(null),
  setupFee: z.number().int().min(0).nullable().optional().default(null),
  perLocationFee: z.number().int().min(0).nullable().optional().default(null),
  percentageFee: z.number().min(0).max(100).nullable().optional().default(null),
  active: z.boolean().default(true),
  order: z.number().int().min(0).max(1000),
})

export const onboardingPackageSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(""),
  currency: z.string().regex(/^[A-Z]{3}$/).default("PKR"),
  monthlyFee: z.number().int().min(0).nullable(),
  setupFee: z.number().int().min(0).nullable(),
  perLocationFee: z.number().int().min(0).nullable(),
  serviceIds: z.array(z.string()).max(50).default([]),
  notes: z.string().trim().max(1000).optional().default(""),
  active: z.boolean().default(true),
  order: z.number().int().min(0).max(1000),
})

export const onboardingDefinitionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  intro: z.string().trim().min(2).max(1000),
  sections: z.array(z.object({ id: z.string(), title: z.string().trim().min(2).max(100), enabled: z.boolean(), order: z.number().int().optional() })).max(20),
  fields: z.array(onboardingFieldSchema).min(2).max(80),
  services: z.array(onboardingServiceSchema).max(80),
  packages: z.array(onboardingPackageSchema).max(40),
  terms: z.array(z.object({ id: z.string(), text: z.string().trim().min(2).max(2000), active: z.boolean(), order: z.number().int().min(0).max(1000) })).max(80),
  consentText: z.string().trim().min(10).max(1000),
})

export type OnboardingDefinition = z.infer<typeof onboardingDefinitionSchema>
export type OnboardingField = z.infer<typeof onboardingFieldSchema>

export const fallbackOnboardingDefinition: OnboardingDefinition = {
  title: "QaziPro Client Onboarding",
  intro: "Tell us about the restaurant and select the services you want QaziPro to prepare.",
  sections: [
    { id: "client", title: "Client Information", enabled: true, order: 1 },
    { id: "services", title: "Services", enabled: true, order: 2 },
    { id: "agreement", title: "Package Agreed", enabled: true, order: 3 },
    { id: "terms", title: "Terms", enabled: true, order: 4 },
    { id: "signature", title: "Signature", enabled: true, order: 5 },
  ],
  fields: [
    { id: "restaurantName", label: "Brand / Restaurant Name", placeholder: "", type: "text", required: true, system: true, enabled: true, order: 1, options: [] },
    { id: "locations", label: "Number of Locations", placeholder: "", type: "number", required: true, system: false, enabled: true, order: 2, options: [] },
    { id: "contactName", label: "Contact Person", placeholder: "", type: "text", required: true, system: true, enabled: true, order: 3, options: [] },
    { id: "designation", label: "Position / Designation", placeholder: "", type: "text", required: false, system: false, enabled: true, order: 4, options: [] },
    { id: "phone", label: "Mobile Number", placeholder: "", type: "phone", required: true, system: false, enabled: true, order: 5, options: [] },
    { id: "email", label: "Email Address", placeholder: "", type: "email", required: true, system: true, enabled: true, order: 6, options: [] },
    { id: "address", label: "Restaurant Address", placeholder: "", type: "textarea", required: true, system: false, enabled: true, order: 7, options: [] },
    { id: "city", label: "City", placeholder: "", type: "text", required: true, system: false, enabled: true, order: 8, options: [] },
  ],
  services: [
    { id: "online-ordering", name: "Online Ordering", description: "Branded direct ordering experience.", monthlyFee: null, setupFee: null, perLocationFee: null, percentageFee: null, active: true, order: 1 },
    { id: "pos", name: "Web & Desktop POS", description: "Connected counter and workstation operations.", monthlyFee: null, setupFee: null, perLocationFee: null, percentageFee: null, active: true, order: 2 },
    { id: "kds", name: "Kitchen Display System", description: "Live production workflow connected to orders.", monthlyFee: null, setupFee: null, perLocationFee: null, percentageFee: null, active: true, order: 3 },
    { id: "staff-apps", name: "Waiter & Rider Apps", description: "Role-based mobile operations.", monthlyFee: null, setupFee: null, perLocationFee: null, percentageFee: null, active: true, order: 4 },
  ],
  packages: [{ id: "custom", name: "Custom Quote", description: "Configured after scope review.", currency: "PKR", monthlyFee: null, setupFee: null, perLocationFee: null, serviceIds: [], notes: "", active: true, order: 1 }],
  terms: [
    { id: "scope-review", text: "Final scope, pricing and delivery dates are confirmed by QaziPro before activation.", active: true, order: 1 },
    { id: "taxes", text: "Applicable taxes and third-party charges are confirmed in the approved commercial agreement.", active: true, order: 2 },
  ],
  consentText: "I confirm the information above and agree that QaziPro may review it to prepare the requested services.",
}

export function calculatePricing(definition: OnboardingDefinition, packageId: string | null, serviceIds: string[], locations: number) {
  const selectedPackage = definition.packages.find((item) => item.active && item.id === packageId) ?? null
  const selectedServices = definition.services.filter((item) => item.active && serviceIds.includes(item.id))
  const numeric = (value: number | null | undefined) => value == null ? 0 : value
  const hasQuotedPrice = Boolean(selectedPackage && [selectedPackage.monthlyFee, selectedPackage.setupFee, selectedPackage.perLocationFee].some((value) => value != null))
    || selectedServices.some((item) => [item.monthlyFee,item.setupFee,item.perLocationFee,item.percentageFee].some((value) => value != null))
  const monthly = numeric(selectedPackage?.monthlyFee) + selectedServices.reduce((sum,item) => sum + numeric(item.monthlyFee),0)
  const setup = numeric(selectedPackage?.setupFee) + selectedServices.reduce((sum,item) => sum + numeric(item.setupFee),0)
  const location = Math.max(1, locations)
  const locationFee = (numeric(selectedPackage?.perLocationFee) + selectedServices.reduce((sum,item) => sum + numeric(item.perLocationFee),0)) * location
  return { currency: selectedPackage?.currency ?? "PKR", monthly, setup, locationFee, hasQuotedPrice }
}
