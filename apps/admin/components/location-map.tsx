"use client"
import { LocationPickerMap, type LocationPickerMapProps } from "@italian-pizza/shared/location-picker-map"
export function LocationMap(props: Omit<LocationPickerMapProps, "tileKey" | "audience">) {
  return <LocationPickerMap {...props} height={400} audience="admin" tileKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_KEY ?? ""} />
}
