// Server-action regression with isolated storage/auth/database transports.
// Never loads .env or contacts Supabase/Vercel; no real tenant is deleted.
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

const mocks = {
  "next/cache": "export const revalidatePath=path=>globalThis.scenario.revalidated.push(path);",
  "next/navigation": "export const redirect=path=>{throw Error('REDIRECT:'+path);};",
  "@/lib/auth": "export const requirePlatformPermission=async()=>({userId:'actor',roleNames:globalThis.scenario.owner?['Platform Owner']:[]});",
  "@/lib/supabase/server": `export const createClient=async()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{slug:globalThis.scenario.slug},error:null})})})}),rpc:async()=>{globalThis.scenario.rpc++;if(globalThis.scenario.dbThrows)throw Error('offline');return {data:true,error:globalThis.scenario.dbError?{}:null};}});`,
  "@/lib/supabase/admin": `export const createPlatformAdminClient=()=>({
    storage:{listBuckets:async()=>({data:[{id:'product-images'}],error:globalThis.scenario.storageError?{}:null}),from:bucket=>({
      list:async folder=>({data:folder==='11111111-1111-1111-1111-111111111111'?[{id:'asset',name:'food.png'}]:[],error:null}),
      remove:async paths=>{globalThis.scenario.removed.push({bucket,paths});if(globalThis.scenario.removeThrows)throw Error('offline');return {error:globalThis.scenario.removeError?{}:null};}
    })},
    from:()=>({insert:async value=>{globalThis.scenario.audit.push(value);return {error:globalThis.scenario.auditError?{}:null};},update:value=>({eq:()=>({eq:()=>({eq:async()=>{globalThis.scenario.audit.push(value);return {error:globalThis.scenario.auditUpdateError?{}:null};}})})})})
  });`,
  "@/lib/platform": "export const slugifyRestaurant=value=>value;",
  "@/lib/onboarding": "export const appIdentifierPattern=/./; export const supportedServiceKeys=[]; export const validateProvisioningRequiredFields=()=>[];",
  "@/lib/public-origin": "export const getPlatformAuthCallbackUrl=()=>'';",
  "@/lib/mutation-result": "export const mutationErrorMessage=()=>'';",
  "@/lib/branch-delivery-areas": "export const populatePlatformBranchAreas=()=>{};",
  "@italian-pizza/shared": "export const deliverExternalInvitation=()=>{}; export const isSyntheticQaEmail=()=>true;",
  "@italian-pizza/shared/domains": "export const normalizeHostname=value=>value; export const stagingHostnameForSlug=value=>value;",
}
const appRoot=fileURLToPath(new URL("../apps/super-admin/",import.meta.url))
const output=await build({
  entryPoints:[appRoot+"app/actions.ts"],tsconfig:appRoot+"tsconfig.json",bundle:true,write:false,platform:"node",format:"esm",
  plugins:[{name:"isolated-server",setup(b){
    b.onResolve({filter:/^(next\/|@\/|@italian-pizza\/)/},args=>({path:args.path,namespace:"mock"}))
    b.onLoad({filter:/.*/,namespace:"mock"},args=>{
      if(!mocks[args.path])throw Error("Unexpected import "+args.path)
      return {contents:mocks[args.path],loader:"js"}
    })
  }}],
})
const {permanentlyDeleteRestaurantAction}=await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"))
const originalEnv=process.env.APP_ENVIRONMENT
let passed=0
const pass=name=>{passed++;console.log("PASS "+name)}
const form=()=>{
  const data=new FormData()
  for(const [name,value] of Object.entries({businessId:"11111111-1111-1111-1111-111111111111",confirmSlug:"test-cafe",confirmDelete:"DELETE",reason:"Approved staging acceptance deletion"}))data.set(name,value)
  return data
}
const reset=extras=>{globalThis.scenario={owner:true,slug:"test-cafe",rpc:0,removed:[],audit:[],revalidated:[],...extras}}
try {
  process.env.APP_ENVIRONMENT="production";reset()
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/only in staging/)
  assert.equal(globalThis.scenario.rpc,0);pass("production action is denied before destructive transports")
  process.env.APP_ENVIRONMENT="staging";reset({owner:false})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/Only a Platform Owner/)
  assert.equal(globalThis.scenario.rpc,0);pass("non-owner deletion is denied")
  for(const [name,value] of [["businessId","------------------------------------"],["confirmDelete","delete"],["reason","short"]]){
    reset();const data=form();data.set(name,value)
    assert.ok((await permanentlyDeleteRestaurantAction(data)).error)
    assert.equal(globalThis.scenario.rpc,0)
  }
  pass("malformed identity and missing typed/audit confirmation cannot delete")
  reset({slug:"other-restaurant"})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/does not match/)
  assert.equal(globalThis.scenario.rpc,0);pass("restaurant-key mismatch fails closed")
  reset({storageError:true})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/Storage safety check failed/)
  assert.equal(globalThis.scenario.rpc,0);pass("storage inspection outage aborts database deletion")
  reset({auditError:true})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/Cleanup audit could not be saved/)
  assert.equal(globalThis.scenario.rpc,0);pass("durable media manifest is required before deletion")
  reset({dbError:true})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/No partial database deletion/)
  assert.deepEqual(globalThis.scenario.removed,[]);pass("atomic database failure never removes media")
  reset({dbThrows:true})
  assert.match((await permanentlyDeleteRestaurantAction(form())).error,/outcome is not yet confirmed/)
  assert.deepEqual(globalThis.scenario.removed,[])
  assert.ok(globalThis.scenario.audit[0].after_data.media.length)
  pass("uncertain database response requires reconciliation instead of claiming nothing was deleted")
  reset()
  await assert.rejects(permanentlyDeleteRestaurantAction(form()),/REDIRECT:\/restaurants\?deleted=1/)
  assert.equal(globalThis.scenario.rpc,1)
  assert.deepEqual(globalThis.scenario.removed,[{bucket:"product-images",paths:["11111111-1111-1111-1111-111111111111/food.png"]}])
  assert.equal(globalThis.scenario.audit[0].action,"RESTAURANT_MEDIA_CLEANUP_PREPARED")
  assert.equal(globalThis.scenario.audit[1].action,"RESTAURANT_MEDIA_CLEANUP_COMPLETED")
  assert.deepEqual(globalThis.scenario.audit[1].after_data.media,[])
  assert.deepEqual(globalThis.scenario.revalidated,["/restaurants"])
  pass("successful delete cleans only tenant UUID media and records completed cleanup")
  for(const key of ["removeError","removeThrows"]){
    reset({[key]:true})
    await assert.rejects(permanentlyDeleteRestaurantAction(form()),/REDIRECT:\/restaurants\?deleted=media-pending/)
    assert.equal(globalThis.scenario.audit[1].action,"RESTAURANT_MEDIA_CLEANUP_PENDING")
    assert.deepEqual(globalThis.scenario.audit[1].after_data.media,globalThis.scenario.removed)
  }
  pass("provider error/timeout preserves exact pending paths and never reports complete cleanup")
  reset({auditUpdateError:true})
  await assert.rejects(permanentlyDeleteRestaurantAction(form()),/REDIRECT:\/restaurants\?deleted=media-pending/)
  assert.ok(globalThis.scenario.audit[0].after_data.media.length)
  pass("cleanup reconciliation failure retains the pre-deletion recovery manifest")
} finally {
  delete globalThis.scenario
  if(originalEnv===undefined)delete process.env.APP_ENVIRONMENT;else process.env.APP_ENVIRONMENT=originalEnv
}
console.log(`${passed} isolated deletion action checks passed; not live storage deletion evidence.`)
