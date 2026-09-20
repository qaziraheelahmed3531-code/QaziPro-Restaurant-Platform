import "server-only"

import { ApiProblem } from "@/lib/api/v1"

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function objectBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiProblem("INVALID_REQUEST", "A JSON object is required.", 400)
  return value as Record<string,unknown>
}
export function stringField(body: Record<string,unknown>, field: string, options: {required?:boolean;minimum?:number;maximum?:number;pattern?:RegExp} = {}) {
  const value=typeof body[field] === "string" ? body[field].trim() : ""
  if(options.required && !value)throw new ApiProblem("VALIDATION_FAILED",`${field} is required.`,422,{field})
  if(value && (value.length < (options.minimum??0) || value.length > (options.maximum??500)))throw new ApiProblem("VALIDATION_FAILED",`${field} has an invalid length.`,422,{field})
  if(value && options.pattern && !options.pattern.test(value))throw new ApiProblem("VALIDATION_FAILED",`${field} is invalid.`,422,{field})
  return value
}

export function numberField(body: Record<string,unknown>, field: string, minimum: number, maximum: number, required = false) {
  if(body[field] === undefined || body[field] === null || body[field] === "") {
    if(required)throw new ApiProblem("VALIDATION_FAILED",`${field} is required.`,422,{field})
    return null
  }
  const value=Number(body[field])
  if(!Number.isFinite(value)||value<minimum||value>maximum)throw new ApiProblem("VALIDATION_FAILED",`${field} is invalid.`,422,{field})
  return value
}

export function uuidField(value: unknown, name: string) {
  if(typeof value !== "string" || !uuidPattern.test(value))throw new ApiProblem("VALIDATION_FAILED",`${name} is invalid.`,422,{field:name})
  return value
}
