import { tarbelaGhaziAreas } from "@/data/tarbela-ghazi-areas"

export type PickupLocationConfig = {
  id: string
  name: string
  address?: string
  logoUrl?: string
}

export type LocationExperienceConfig = {
  brandName: string
  brandLogoUrl?: string
  deliveryCity: "Tarbela Ghazi"
  supportedAreas: typeof tarbelaGhaziAreas
  pickupLocations: PickupLocationConfig[]
}

export const locationExperienceConfig: LocationExperienceConfig = {
  brandName: "ITALIAN PIZZA",
  deliveryCity: "Tarbela Ghazi",
  supportedAreas: tarbelaGhaziAreas,
  pickupLocations: [
    {
      id: "tarbela-ghazi",
      name: "Italian Pizza — Tarbela Ghazi",
    },
  ],
}
