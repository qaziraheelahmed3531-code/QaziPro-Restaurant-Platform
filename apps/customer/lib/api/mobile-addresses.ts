import "server-only"

import { locationSource } from "@italian-pizza/shared/location"

import { ApiProblem } from "@/lib/api/v1"
import { numberField, objectBody, stringField, uuidField } from "@/lib/api/mobile-validation"
import { validateDeliveryPoint } from "@/lib/location/validate-delivery"
import type { StorefrontSnapshot } from "@/types"

type AddressRow=Record<string,unknown>&{delivery_areas?:{slug?:string}|Array<{slug?:string}>|null}

export function publicAddress(row: AddressRow) {
  const area=Array.isArray(row.delivery_areas)?row.delivery_areas[0]:row.delivery_areas
  return {id:row.id,branchId:row.branch_id,label:row.label,city:row.city,areaId:area?.slug??null,deliveryAreaId:row.delivery_area_id,addressLine1:row.address_line_1,addressLine2:row.address_line_2,landmark:row.landmark,instructions:row.instructions,isDefault:Boolean(row.is_default),coordinates:row.latitude!==null&&row.longitude!==null?{latitude:Number(row.latitude),longitude:Number(row.longitude),source:locationSource(row.location_source)}:null,createdAt:row.created_at}
}

export async function addressPayload(raw: unknown, snapshot: StorefrontSnapshot, partial=false) {
  const body=objectBody(raw)
  const selectedArea=body.deliveryAreaId===undefined&&partial?undefined:uuidField(body.deliveryAreaId,"deliveryAreaId")
  if(selectedArea && !snapshot.deliveryAreas.some(area=>area.databaseId===selectedArea))throw new ApiProblem("DELIVERY_AREA_MISMATCH","The delivery area does not belong to this branch.",422)
  const latitude=body.latitude===undefined&&partial?undefined:numberField(body,"latitude",-90,90,!partial)
  const longitude=body.longitude===undefined&&partial?undefined:numberField(body,"longitude",-180,180,!partial)
  if((latitude===null)!==(longitude===null) || (latitude===undefined)!==(longitude===undefined))throw new ApiProblem("VALIDATION_FAILED","Both latitude and longitude are required.",422)
  if(typeof latitude==="number"&&typeof longitude==="number") {
    try { await validateDeliveryPoint({latitude,longitude},snapshot,selectedArea) }
    catch(error){throw new ApiProblem("DELIVERY_LOCATION_INVALID",error instanceof Error?error.message:"Delivery location is invalid.",422)}
  }
  const labelValue=body.label===undefined&&partial?undefined:stringField(body,"label",{required:!partial,maximum:20})
  if(labelValue!==undefined && !["home","work","other"].includes(labelValue))throw new ApiProblem("VALIDATION_FAILED","label must be home, work or other.",422,{field:"label"})
  return {
    ...(labelValue===undefined?{}:{label:labelValue}),
    ...(selectedArea===undefined?{}:{delivery_area_id:selectedArea}),
    ...(body.addressLine1===undefined&&partial?{}:{address_line_1:stringField(body,"addressLine1",{required:true,maximum:500})}),
    ...(body.addressLine2===undefined&&partial?{}:{address_line_2:stringField(body,"addressLine2",{maximum:500})}),
    ...(body.landmark===undefined&&partial?{}:{landmark:stringField(body,"landmark",{maximum:250})}),
    ...(body.instructions===undefined&&partial?{}:{instructions:stringField(body,"instructions",{maximum:500})}),
    ...(body.locationSource===undefined&&partial?{}:{location_source:locationSource(body.locationSource)}),
    ...(latitude===undefined?{}:{latitude}),...(longitude===undefined?{}:{longitude}),
    city:snapshot.branch.city,business_id:snapshot.business.id!,branch_id:snapshot.branch.id!,
  }
}
