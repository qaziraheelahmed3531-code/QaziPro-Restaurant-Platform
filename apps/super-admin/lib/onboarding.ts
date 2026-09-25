export type ProvisioningRequiredFields = {
  name: string
  ownerName: string
  ownerEmail: string
  city: string
  packageId: string
  branchNames: string[]
  branchCodes: string[]
  branchCities?: string[]
  branchCountryCodes?: string[]
  branchAddresses?: string[]
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const appIdentifierPattern = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/
export const supportedServices = [
  ["admin.restaurant", "Restaurant Admin"], ["pos.web", "Web POS"], ["pos.desktop", "Desktop POS"],
  ["inventory", "Inventory"], ["kitchen", "Kitchen / KDS"], ["waiter", "Waiter / Table Service"], ["rider", "Rider Delivery"],
  ["website.ordering", "Customer Website"], ["ordering.delivery", "Delivery Orders"], ["ordering.pickup", "Pickup Orders"], ["loyalty", "Loyalty"], ["reports.advanced", "Advanced Reports"],
  ["mobile.android", "Android App"], ["mobile.ios", "iOS App"],
] as const
export const supportedServiceKeys = new Set<string>(supportedServices.map(([key]) => key))

export function onboardingFieldMessage(name: string, fallback = "Complete this field.") {
  const messages: Record<string, string> = {
    name: "Enter a restaurant brand name with at least two characters.",
    ownerName: "Enter the restaurant owner's name.",
    ownerEmail: "Enter a valid owner email address.",
    city: "Enter the restaurant's city.",
    packageId: "Select an active service package before continuing.",
    branchName: "Enter a name for every branch.",
    branchCode: "Enter a code for every branch.",
    branchCity: "Enter a city for every branch.",
    branchCountryCode: "Enter a two-letter country code for every branch.",
    branchAddress: "Enter an address for every branch.",
    androidId: "Enter a valid Android package ID such as com.qazipro.restaurant.",
    iosId: "Enter a valid iOS bundle ID such as com.qazipro.restaurant.",
  }
  return messages[name] ?? fallback
}

export function validateProvisioningRequiredFields(input: ProvisioningRequiredFields) {
  if (input.name.length < 2) return onboardingFieldMessage("name")
  if (input.ownerName.length < 2) return onboardingFieldMessage("ownerName")
  if (!emailPattern.test(input.ownerEmail)) return onboardingFieldMessage("ownerEmail")
  if (!input.city) return onboardingFieldMessage("city")
  if (!input.packageId) return onboardingFieldMessage("packageId")
  if (!input.branchNames.length || input.branchNames.some((name) => !name)) return onboardingFieldMessage("branchName")
  if (input.branchCodes.length !== input.branchNames.length || input.branchCodes.some((code) => !code)) return onboardingFieldMessage("branchCode")
  if (input.branchCities && (input.branchCities.length !== input.branchNames.length || input.branchCities.some((city) => !city))) return onboardingFieldMessage("branchCity")
  if (input.branchCountryCodes && (input.branchCountryCodes.length !== input.branchNames.length || input.branchCountryCodes.some((code) => !/^[A-Z]{2}$/.test(code)))) return onboardingFieldMessage("branchCountryCode")
  if (input.branchAddresses && (input.branchAddresses.length !== input.branchNames.length || input.branchAddresses.some((address) => !address))) return onboardingFieldMessage("branchAddress")
  return null
}
