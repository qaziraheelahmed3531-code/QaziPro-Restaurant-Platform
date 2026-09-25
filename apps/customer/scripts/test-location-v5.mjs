// Tests the actual coverage, reverse-geocoder, checkout hook and server source.
// Synthetic coordinates only; no provider calls or real orders.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import * as coverage from '../../../packages/shared/src/location.ts'
const require = createRequire(import.meta.url), ts = require('typescript')
const root = new URL('../../../', import.meta.url)
function load(path, modules, globals = {}, suffix = '') {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(path, root), 'utf8') + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in modules, 'Known dependency: ' + name); return modules[name] }, process: { env: { NODE_ENV: 'production' } }, AbortController, ...globals })
  return exports
}
const matcher = load('apps/customer/data/tarbela-ghazi-areas.ts', { '@italian-pizza/shared/location': coverage })
const areas = [
  { id: 'hamlet-colony', databaseId: '33333333-3333-4333-8333-333333333333', label: 'Hamlet Colony', aliases: ['Hamlet'], group: 'ghazi-nearby', boundaryType: 'LOCALITY_MATCH' },
  { id: 'ghazi', label: 'Ghazi', aliases: [], group: 'ghazi-nearby', boundaryType: 'LOCALITY_MATCH' },
  { id: 'sobra-city', label: 'Sobra City', aliases: ['Subra'], group: 'ghazi-nearby', boundaryType: 'LOCALITY_MATCH' },
]
assert.equal(matcher.matchAreaCandidates([{source:'neighbourhood',value:'Hamlet'}, {source:'name',value:'Ghazi'}, {source:'city',value:'Ghazi'}], areas)?.area.id, 'hamlet-colony')
assert.equal(matcher.matchAreaCandidates([{source:'formatted',value:'House 8, Hamlet Colony, Ghazi'}, {source:'name',value:'Ghazi'}], areas)?.area.id, 'hamlet-colony')
assert.equal(matcher.matchAreaCandidates([{source:'suburb',value:'Subra'}], areas)?.area.id, 'sobra-city')
assert.equal(matcher.matchAreaCandidates([{source:'city',value:'Ghazi'}], areas), undefined)
assert.equal(matcher.matchAreaCandidates([{source:'city',value:'Hamlet'},{source:'municipality',value:'Topi Tehsil'}], [...areas,{id:'topi',label:'Topi',aliases:[],group:'extended-belt'}])?.area.id,'hamlet-colony')
assert.equal(matcher.matchAreaCandidates([{source:'city',value:'Islamabad'},{source:'suburb',value:'F-10'}], areas), undefined)
assert.equal(matcher.matchAreaCandidates([{source:'neighbourhood',value:'Hamlet'}], []), undefined)
assert.equal(coverage.normalizeLocality('  HAMLET--Colony!  '), 'hamlet colony')
assert.equal(coverage.normalizeLocality('غازی'), 'غازی')
console.log('PASS: Hamlet beats generic Ghazi, DB aliases, Unicode normalization, empty DB and outside locality')
const polygon = { type:'Polygon', coordinates:[[[72,33],[73,33],[73,34],[72,34],[72,33]], [[72.4,33.4],[72.6,33.4],[72.6,33.6],[72.4,33.6],[72.4,33.4]]] }
assert.ok(coverage.insideBoundary({latitude:33.2,longitude:72.2},polygon))
assert.ok(!coverage.insideBoundary({latitude:33.5,longitude:72.5},polygon))
assert.ok(!coverage.insideBoundary({latitude:35,longitude:72.5},polygon))
assert.ok(coverage.insideBoundary({latitude:33.2,longitude:72.2},{type:'MultiPolygon',coordinates:[polygon.coordinates]}))
assert.equal(coverage.parseBoundary({type:'Polygon',coordinates:[[[1,2],[3,4],[1,2]]]}),null)
assert.equal(coverage.parseBoundary({type:'Polygon',coordinates:[[[1,2],[3,4],[5,6],[7,8]]]}),null)
const radius = {...areas[0],boundaryType:'RADIUS',centerLatitude:33.2,centerLongitude:72.2,serviceRadiusMeters:500}
assert.equal(coverage.geometryMatch({latitude:33.201,longitude:72.201},[radius])?.id, radius.id)
assert.equal(coverage.geometryMatch({latitude:34,longitude:73},[radius]),undefined)
assert.equal(coverage.geometryMatch({latitude:33.2,longitude:72.2},[{...radius,serviceRadiusMeters:null}]),undefined)
assert.equal(coverage.canMatchLocality(radius),false)
assert.equal(coverage.geometryMatch({latitude:33.2,longitude:72.2},[radius,{...areas[2],boundaryType:'POLYGON',boundaryGeojson:polygon}])?.id,'sobra-city')
console.log('PASS: polygon, holes, MultiPolygon, radius, configured threshold and polygon priority')
let raw = { lat:33.2005,lon:72.2005,neighbourhood:'Hamlet',name:'Ghazi',city:'Ghazi',formatted:'Hamlet, Ghazi, Pakistan' }
class ServiceError extends Error {}
const reverse = load('apps/customer/lib/geoapify/reverse-geocode.ts', {
  'server-only': {}, '@italian-pizza/shared/location':coverage, '@/data/tarbela-ghazi-areas': matcher,
  '@/lib/geoapify/client': { asNumber:x=>typeof x==='number'?x:null, asString:x=>typeof x==='string'?x:null,GeoapifyServiceError:ServiceError,getGeoapifyJson:async()=>({results:[raw]}) },
})
const result = await reverse.reverseGeocode(33.2,72.2,areas)
assert.equal(result.coordinates.latitude,33.2)
assert.equal(result.coordinates.longitude,72.2)
assert.equal(result.matchedAreaId,'hamlet-colony')
assert.ok(!('diagnostics' in result))
const outside = await reverse.reverseGeocode(35,74,[radius])
assert.equal(outside.matchedAreaId,null)
const validation = load('apps/customer/lib/location/validate-delivery.ts', {
  'server-only':{}, '@italian-pizza/shared/location':coverage, '@/lib/location/resolve-address':{resolveDeliveryAddress:reverse.reverseGeocode},
})
const storefront = {source:'database',business:{id:'11111111-1111-4111-8111-111111111111'},branch:{id:'22222222-2222-4222-8222-222222222222',deliveryEnabled:true,maximumDistanceKm:20,originLatitude:33.1,originLongitude:72.1},deliveryAreas:[radius]}
assert.equal((await validation.validateDeliveryPoint({latitude:33.2,longitude:72.2},storefront,radius.databaseId)).id,radius.id)
await assert.rejects(validation.validateDeliveryPoint({latitude:35,longitude:74},storefront,radius.id),/outside/)
await assert.rejects(validation.validateDeliveryPoint({latitude:33.2,longitude:72.2},storefront,'sobra-city'),/Update/)
await assert.rejects(validation.validateDeliveryPoint({latitude:33.2,longitude:72.2},{...storefront,source:'fallback'}),/unavailable/)
assert.throws(()=>validation.validateRouteDistance(21,storefront),/beyond/)
console.log('PASS: original pin retained, production diagnostics hidden, outside pin and selected-area mismatch rejected server-side')

// Small dependency-aware hook harness. Proves state/async sequencing, not visual browser QA.
let cursor=0, pendingEffects=[], cleanups=[], values=[], deps=[], refs=[], refCursor=0
let nextReverse=result, delayed
const app = { hydrated:false,selectedAreaId:'hamlet-colony',selectedArea:areas[0],coordinates:null,storefront:{branch:{id:'qa-branch',locationRevision:1},deliveryAreas:areas},
  clearCoordinates(){this.coordinates=null},selectDetectedArea(id){this.selectedAreaId=id;this.selectedArea=areas.find(a=>a.id===id)},setCoordinates(value){this.coordinates=value} }
const react = {
  useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return[values[index],value=>values[index]=typeof value==='function'?value(values[index]):value]},
  useRef(initial){return refs[refCursor++]??={current:initial}},
  useEffect(fn,dependencies){const index=cursor++;if(!deps[index]||dependencies.some((value,i)=>value!==deps[index][i])){deps[index]=dependencies;pendingEffects.push(()=>{cleanups[index]?.();cleanups[index]=fn()})}},
}
let address=''
const hook = load('apps/customer/lib/location/use-checkout-location.ts', {
  react,'@/components/providers/app-provider':{useApp:()=>app},
  '@italian-pizza/shared/location':coverage,
  '@/lib/location/get-browser-location':{getBrowserLocation:async()=>({latitude:33.2,longitude:72.2})},
  '@/lib/location/api':{getAddressSuggestions:async()=>[],getPlaceDetails:async()=>({suggestion:null}),reverseCurrentLocation:async()=>delayed?await delayed:nextReverse},
})
function render(){cursor=0;refCursor=0;const h=hook.useCheckoutLocation(value=>address=value);const effects=pendingEffects;pendingEffects=[];effects.forEach(fn=>fn());return h}
let h=render()
await h.resolve({latitude:33.2,longitude:72.2,source:'MAP_PIN'})
h=render();assert.ok(h.coordinates);assert.equal(address,result.formattedAddress);assert.equal(app.coordinates.source,'MAP_PIN')
nextReverse={...result,matchedAreaId:'sobra-city',matchedAreaLabel:'Sobra City'}
await h.resolve({latitude:33.3,longitude:72.3,source:'AUTOCOMPLETE'},'Exact selected address')
h=render();assert.equal(h.mismatch,undefined);assert.equal(app.selectedAreaId,'sobra-city');assert.ok(h.coordinates);assert.equal(address,'Exact selected address');assert.match(h.message,/Delivery area updated/)
nextReverse={...result,matchedAreaId:null,matchedAreaLabel:null}
await h.resolve({latitude:35,longitude:74,source:'MAP_PIN'});h=render();assert.equal(h.coordinates,undefined);assert.equal(app.coordinates,null);assert.match(h.message,/outside/)
let release;delayed=new Promise(resolve=>release=resolve)
const stale=h.resolve({latitude:33.2,longitude:72.2,source:'GPS'})
h=render();h.invalidate();release(result);await stale;delayed=undefined;h=render()
assert.equal(h.coordinates,undefined);assert.equal(app.coordinates,null)
await h.loadLegacyAddress('Unknown saved address','hamlet-colony');h=render();assert.equal(h.coordinates,undefined);assert.match(h.message,/select a search result/)
cleanups.forEach(fn=>fn?.())
console.log('PASS: address → pin, explicit cross-area switch, outside disables checkout, stale response suppression, legacy saved-address no guessed pin')

let rpcCount=0, routeCount=0
const commerce = await import('../../../packages/shared/src/commerce.ts')
const order = load('apps/customer/lib/orders/server.ts',{
  'server-only':{},'node:crypto':require('node:crypto'),'@italian-pizza/shared/location':coverage,
  '@italian-pizza/shared/commerce':commerce,'@/lib/location/validate-delivery':validation,
  '@/lib/geoapify/routing':{getDrivingRoute:async()=>{routeCount++;return{distanceKm:7}}},
  '@/lib/entitlements/server':{requireRuntimeEntitlements:async()=>{}},
  '@/lib/restrictions/server':{assertCustomerIdentityAllowed:async()=>{}},
  '@/lib/supabase/server':{isSupabaseConfigured:()=>false},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(_name,{p_payload})=>{rpcCount++;assert.equal(p_payload.distanceKm,7);assert.equal(p_payload.locationSource,'MAP_PIN');return{data:{ok:true},error:null}}})},
})
const input={idempotencyKey:'qa-location-v5-order',branchId:storefront.branch.id,serviceMode:'DELIVERY',paymentMethod:'CASH_ON_DELIVERY',customerName:'QA',customerPhone:'03000000000',deliveryAreaId:radius.databaseId,deliveryAddress:'QA address',latitude:35,longitude:74,locationSource:'MAP_PIN',distanceKm:0,deliveryFee:0,items:[{productId:'40000000-0000-4000-8000-000000000001',quantity:1}]}
await assert.rejects(order.createOrder(input,storefront),/outside/)
assert.equal(rpcCount,0);assert.equal(routeCount,0)
await order.createOrder({...input,latitude:33.2,longitude:72.2},storefront)
assert.equal(rpcCount,1);assert.equal(routeCount,1)
console.log('PASS: actual order handler rejects outside before RPC and recomputes distance rather than trusting client fee/distance')

// Fresh geolocation and bounded accuracy-watch cleanup.
let currentSuccess, currentFailure, watchSuccess, watchFailure, timerCallback
let clearWatchCount=0, clearTimerCount=0, currentOptions
const gps=load('apps/customer/lib/location/get-browser-location.ts',{},{
  DOMException,
  navigator:{geolocation:{
    getCurrentPosition(success,failure,options){currentSuccess=success;currentFailure=failure;currentOptions=options},
    watchPosition(success,failure){watchSuccess=success;watchFailure=failure;return 42},
    clearWatch(id){assert.equal(id,42);clearWatchCount++},
  }},
  window:{isSecureContext:true,setTimeout(fn){timerCallback=fn;return 7},clearTimeout(id){assert.equal(id,7);clearTimerCount++}},
})
const position=accuracy=>({coords:{latitude:33.2,longitude:72.2,accuracy}})
const precise=gps.getBrowserLocation();currentSuccess(position(20));assert.equal((await precise).accuracy,20)
assert.equal(currentOptions.enableHighAccuracy,true);assert.equal(currentOptions.maximumAge,0);assert.equal(currentOptions.timeout,15000);assert.equal(clearWatchCount,0)
const improve=gps.getBrowserLocation();currentSuccess(position(900));watchSuccess(position(30));assert.equal((await improve).accuracy,30);assert.equal(clearWatchCount,1);assert.equal(clearTimerCount,1)
const bounded=gps.getBrowserLocation();currentSuccess(position(900));watchSuccess(position(200));timerCallback();assert.equal((await bounded).accuracy,200);assert.equal(clearWatchCount,2)
const cancelledController=new AbortController();const cancelled=gps.getBrowserLocation(cancelledController.signal);currentSuccess(position(900));cancelledController.abort();await assert.rejects(cancelled,/cancelled/);assert.equal(clearWatchCount,3)
const denied=gps.getBrowserLocation();currentFailure({code:1,PERMISSION_DENIED:1,TIMEOUT:3});await assert.rejects(denied,/denied/)
const failedWatch=gps.getBrowserLocation();currentSuccess(position(180));watchFailure();assert.equal((await failedWatch).accuracy,180);assert.equal(clearWatchCount,4)
console.log('PASS: fresh high-accuracy GPS, bounded best-position watch, timeout, abort and permission cleanup')

const unlocks=[], body={style:{overflow:'auto'}}
const locks=load('apps/customer/hooks/use-body-scroll-lock.ts',{react:{useEffect(fn){unlocks.push(fn())}}},{document:{body}})
locks.useBodyScrollLock(true);locks.useBodyScrollLock(true);assert.equal(body.style.overflow,'hidden')
unlocks[0]();assert.equal(body.style.overflow,'hidden');unlocks[1]();assert.equal(body.style.overflow,'auto');unlocks[1]();assert.equal(body.style.overflow,'auto')
console.log('PASS: shared overlay lock nesting, release and idempotent cleanup (unit test, not browser scroll QA)')

const provider=load('apps/customer/components/providers/app-provider.tsx',{
  react:{createContext:()=>({})},'react/jsx-runtime':{},'next/navigation':{},
  '@italian-pizza/shared/location':coverage,'@/lib/location/api':{},
  '@/lib/supabase/client':{},
},{},'\nexport { reducer, initialState, safePersistedState };')
const saved=provider.safePersistedState({coordinates:{latitude:33.2,longitude:72.2},locationSource:'GPS',deliveryQuote:{distanceKm:1,deliveryFee:0},selectedAreaId:'hamlet-colony'})
let state=provider.reducer(provider.initialState,{type:'hydrate',payload:saved})
assert.equal(state.deliveryQuote,null);assert.equal(state.deliveryQuoteStatus,'loading')
state=provider.reducer({...state,cart:[{lineId:'preserved'}],locationOpen:true},{type:'area',areaId:'sobra-city'})
assert.equal(state.coordinates,null);assert.equal(state.deliveryQuote,null);assert.equal(state.locationSource,'MANUAL_AREA');assert.equal(state.locationOpen,false);assert.equal(state.cart.length,1)
const staleQuote=provider.reducer(state,{type:'delivery-quote',coordinates:{latitude:33.2,longitude:72.2},quote:{distanceKm:1,deliveryFee:0}})
assert.equal(staleQuote.deliveryQuote,null)
state=provider.reducer(state,{type:'coordinates',coordinates:{latitude:33.3,longitude:72.3,source:'MAP_PIN'}})
assert.equal(state.locationSource,'MAP_PIN')
assert.equal(provider.safePersistedState({coordinates:{latitude:33.2}}).coordinates,null)
console.log('PASS: actual shared reducer clears old pins/quotes on manual area changes, rechecks persisted quotes, preserves cart and tracks location source')
