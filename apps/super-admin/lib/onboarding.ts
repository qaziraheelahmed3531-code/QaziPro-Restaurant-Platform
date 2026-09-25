export type ProvisioningRequiredFields = {
  name: string
  ownerName: string
  ownerEmail: string
  city: string
  packageId: string
  branchNames: string[]
  branchCodes: string[]
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function onboardingFieldMessage(name: string, fallback = "Complete this field.") {
  const messages: Record<string, string> = {
    name: "Enter a restaurant brand name with at least two characters.",
    ownerName: "Enter the restaurant owner's name.",
    ownerEmail: "Enter a valid owner email address.",
    city: "Enter the restaurant's city.",
    packageId: "Select an active service package before continuing.",
    branchName: "Enter a name for every branch.",
    branchCode: "Enter a code for every branch.",
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
  return null
}
