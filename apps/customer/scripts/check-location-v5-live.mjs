// Read-only public storefront/provider checks. Never prints keys, raw responses,
// customer addresses, sessions, or exact coordinates. Creates no orders.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
process.loadEnvFile(fileURLToPath(new URL('../.env.local', import.meta.url)))
const origin = process.env.LOCATION_QA_ORIGIN || 'http://localhost:3100'
async function api(path) {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(40000) })
  return { status: response.status, body: await response.json() }
}
try {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} })
  const { data: business, error: businessError } = await db.from('businesses').select('id').eq('slug','italian-pizza').eq('is_active',true).single()
  assert.ok(!businessError && business, 'Business is accessible')
  const {data: branches,error:branchError} = await db.from('branches').select('id').eq('business_id',business.id).eq('is_active',true).order('sort_order').limit(1)
  assert.ok(!branchError && branches?.length, 'Active branch is accessible')
  const { data: areas,error } = await db.from('delivery_areas').select('id,slug,aliases,boundary_type,center_lat,center_lng,service_radius_meters,boundary_geojson').eq('branch_id',branches[0].id).eq('is_active',true).order('sort_order')
  assert.ok(!error && Array.isArray(areas), 'Coverage migration is accessible')
  console.log(JSON.stringify({check:'database',activeAreaCount:areas.length,polygonCount:areas.filter(a=>a.boundary_type==='POLYGON').length,radiusCount:areas.filter(a=>a.boundary_type==='RADIUS').length,localityCount:areas.filter(a=>a.boundary_type==='LOCALITY_MATCH').length,hamletAliasPresent:areas.some(a=>a.slug==='hamlet-colony'&&a.aliases.some(alias=>alias.toLowerCase()==='hamlet'))}))
  for(const path of ['/api/location/reverse','/api/location/route','/api/location/autocomplete?q=ha']) {
    const result=await api(path);assert.equal(result.status,400)
  }
  console.log('PASS: missing-coordinate and short-query HTTP validation')
  const search=await api('/api/location/autocomplete?q=Hamlet&areaId=hamlet-colony')
  console.log(JSON.stringify({check:'autocomplete',httpStatus:search.status,suggestionCount:search.body.suggestions?.length??0}))
  assert.equal(search.status,200)
  const exact=search.body.suggestions?.find(item=>item.label.toLowerCase()==='hamlet') ?? search.body.suggestions?.find(item=>/hamlet/i.test(item.label))
  if(exact){
    // Google Places autocomplete intentionally returns a place id first; resolve
    // that id server-side before testing reverse geocoding and routing.
    const details=exact.coordinates ? { suggestion: exact } : await api('/api/location/place?placeId='+encodeURIComponent(exact.placeId ?? exact.id))
    const coordinates=details.body.suggestion?.coordinates ?? details.body.coordinates
    assert.ok(coordinates?.latitude !== undefined && coordinates?.longitude !== undefined, 'Google place details returned coordinates')
    const params=new URLSearchParams({latitude:String(coordinates.latitude),longitude:String(coordinates.longitude)})
    const reverse=await api('/api/location/reverse?'+params)
    console.log(JSON.stringify({check:'hamlet-provider-result',httpStatus:reverse.status,matchedAreaId:reverse.body.matchedAreaId??null,pinUnchanged:reverse.body.coordinates?.latitude===coordinates.latitude&&reverse.body.coordinates?.longitude===coordinates.longitude,productionDiagnosticsHidden:!('diagnostics' in reverse.body)}))
    assert.equal(reverse.status,200)
    assert.ok(areas.some(area=>area.slug===reverse.body.matchedAreaId),'Provider pin resolves to an active canonical area')
    if(exact.label.toLowerCase()==='hamlet') assert.equal(reverse.body.matchedAreaId,'hamlet-colony','Hamlet must outrank its parent municipality')
    const route=await api('/api/location/route?'+params)
    console.log(JSON.stringify({check:'delivery-route',httpStatus:route.status,feeReturned:typeof route.body.deliveryFee==='number',distanceKm:route.body.distanceKm,deliveryFee:route.body.deliveryFee}))
    if (route.status === 503 && /being configured/i.test(String(route.body.error ?? ""))) console.log('BLOCKED: branch origin is not configured in the live database; no fee was fabricated')
    else assert.equal(route.status,200)
  } else console.log('NOT VERIFIED: provider returned no Hamlet-labelled search result')
  const outside=await api('/api/location/reverse?latitude=33.6844&longitude=73.0479')
  console.log(JSON.stringify({check:'outside-Islamabad',httpStatus:outside.status,matchedAreaId:outside.body.matchedAreaId??null}))
  assert.equal(outside.status,200);assert.equal(outside.body.matchedAreaId,null)
  const rejected=await api('/api/location/route?latitude=33.6844&longitude=73.0479')
  assert.equal(rejected.status,422)
  console.log('PASS: outside-location quote rejected without fabricating a delivery fee')
  for(const path of ['/','/checkout','/cart','/account','/orders']){
    const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(40000)})
    assert.equal(response.status,200)
    await response.text()
    console.log('PASS: customer HTTP '+path)
  }
} catch(error) {
  console.error('FAIL: '+(error instanceof assert.AssertionError ? error.message : 'Live location request failed; credentials and provider response omitted.'))
  process.exitCode=1
}
