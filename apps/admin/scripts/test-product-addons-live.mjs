import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

// Isolated restaurant fixtures only. No customer email or live restaurant orders.
process.loadEnvFile(new URL('../../backend/.env.local',import.meta.url))
const env=process.env
const service=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const checked=(r,label)=>{if(r.error)throw Error(`${label}: ${r.error.message}`);return r.data}
const run=randomUUID(),business=randomUUID(),otherBusiness=randomUUID(),branch=randomUUID(),category=randomUUID(),product=randomUUID(),addon=randomUUID(),foreign=randomUUID(),ingredient=randomUUID(),order=randomUUID()
let userId,groupId
const deviceId=randomUUID(),offlineOrderId=randomUUID(),offlineShiftId=randomUUID()
const remove=async(table,column,value)=>checked(await service.from(table).delete().eq(column,value),`Cleanup ${table}`)
try {
  checked(await service.from('businesses').insert([{id:business,slug:`qa-addons-${run}`,name:'QA Add-ons'}, {id:otherBusiness,slug:`qa-other-${run}`,name:'QA Tenant Boundary'}]),'businesses')
  checked(await service.from('branches').insert({id:branch,business_id:business,code:'QA',name:'QA branch',city:'Islamabad'}),'branch')
  const foreignCategory=randomUUID()
  checked(await service.from('categories').insert([{id:category,business_id:business,slug:'qa',name:'QA'},{id:foreignCategory,business_id:otherBusiness,slug:'qa',name:'QA'}]),'category')
  checked(await service.from('products').insert([{id:product,business_id:business,category_id:category,slug:'qa-pizza',name:'QA Pizza',base_price:500},{id:addon,business_id:business,category_id:category,slug:'qa-drink',name:'QA Beverage',base_price:100},{id:foreign,business_id:otherBusiness,category_id:foreignCategory,slug:'qa-foreign',name:'Other restaurant item',base_price:1}]),'products')
  const email=`qa-addon-${run}@example.test`,password=`Qa!${randomUUID()}9`
  userId=checked(await service.auth.admin.createUser({email,password,email_confirm:true}),'user').user.id
  const member=checked(await service.from('staff_memberships').insert({business_id:business,branch_id:branch,user_id:userId,role:'MANAGER',is_active:true,permissions_customized:true}).select('id').single(),'membership')
  checked(await service.from('staff_membership_permissions').insert(['modifiers.manage','pos.use','desktop_pos.use'].map(permission_code=>({membership_id:member.id,permission_code}))),'permission')
  checked(await service.from('pos_payment_methods').insert({business_id:business,code:'CASH',name:'Cash',kind:'CASH'}),'payment method')
  const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  checked(await client.auth.signInWithPassword({email,password}),'login')
  const draft={name:'QA Choose beverage',selection_type:'MULTIPLE',is_required:false,min_selections:0,max_selections:2,modifier_options:[{name:'Forged label',price_adjustment:1,linked_product_id:addon},{name:'Plain topping',price_adjustment:20}]}
  groupId=checked(await client.rpc('save_modifier_group',{p_business_id:business,p_group:draft}),'save')
  const readOptions=async()=>checked(await service.from('modifier_options').select('*').eq('modifier_group_id',groupId).order('sort_order'),'options')
  let options=await readOptions()
  assert.equal(options[0].name,'QA Beverage');assert.equal(options[0].price_adjustment,100)
  checked(await service.from('product_images').insert({product_id:addon,url:'https://example.test/beverage.png',is_primary:true,sort_order:0}),'image')
  checked(await service.from('products').update({name:'QA Cold Beverage',sale_price:80}).eq('id',addon),'price change')
  options=await readOptions();assert.equal(options[0].name,'QA Cold Beverage');assert.equal(options[0].price_adjustment,80);assert.equal(options[0].image_url,'https://example.test/beverage.png')
  const linked=options[0]
  const invalid=await client.rpc('save_modifier_group',{p_business_id:business,p_group:{...draft,id:groupId,name:'MUST ROLL BACK',modifier_options:[{...linked,name:'ignored'},{name:'Invalid foreign product',price_adjustment:1,linked_product_id:foreign}]}})
  assert.ok(invalid.error,'foreign restaurant product must be rejected')
  assert.equal(checked(await service.from('modifier_groups').select('name').eq('id',groupId).single(),'rollback').name,draft.name)
  assert.equal((await readOptions()).length,2,'failed save cannot leave partial choices')
  assert.ok((await client.rpc('remove_modifier_group',{p_business_id:otherBusiness,p_group_id:groupId})).error,'tenant access must be denied')
  checked(await service.from('product_modifier_groups').insert({product_id:product,modifier_group_id:groupId}),'assignment')
  const catalogId=checked(await client.rpc('register_desktop_pos_catalog',{p_branch_id:branch,p_device_id:deviceId,p_device_name:'QA add-on counter',p_app_version:'0.1.0'}),'offline catalog')
  const soldAt=new Date().toISOString()
  checked(await service.from('ingredients').insert({id:ingredient,business_id:business,branch_id:branch,name:'QA Bottles',unit:'piece',current_stock:10}),'ingredient')
  checked(await service.from('recipes').insert({business_id:business,product_id:addon,ingredient_id:ingredient,quantity:1}),'recipe')
  checked(await service.from('orders').insert({id:order,order_number:`QA-ADDON-${run}`,business_id:business,branch_id:branch,channel:'POS',operational_order_type:'TAKEAWAY',service_mode:'PICKUP',status:'RECEIVED',customer_name:'QA ONLY',customer_phone:'00000000000',subtotal:1160,total:1160}),'order')
  const item=checked(await service.from('order_items').insert({order_id:order,product_id:product,product_name:'QA Pizza',quantity:2,unit_base_price:500,unit_modifier_price:80,unit_price:580,line_total:1160}).select('id').single(),'item')
  checked(await service.from('order_item_modifiers').insert({order_item_id:item.id,modifier_group_id:groupId,modifier_option_id:linked.id,group_name:draft.name,option_name:linked.name,price_adjustment:80}),'modifier snapshot')
  assert.equal(checked(await service.from('order_item_modifiers').select('linked_product_id').eq('order_item_id',item.id).single(),'snapshot').linked_product_id,addon)
  checked(await client.rpc('save_modifier_group',{p_business_id:business,p_group:{...draft,id:groupId,modifier_options:[linked]}}),'remove custom option')
  assert.equal((await readOptions()).filter(o=>o.is_active).length,1,'removed option must be archived')
  checked(await client.rpc('remove_modifier_group',{p_business_id:business,p_group_id:groupId}),'remove group')
  const payload={deviceId,catalogVersionId:catalogId,offlineOrderId,offlineShiftId,soldAt,branchId:branch,openingCash:0,shiftOpenedAt:soldAt,shiftClosedAt:null,countedCash:null,customerName:'QA Offline Add-on',customerPhone:'Counter',notes:'Isolated test only',orderType:'TAKEAWAY',tableReference:'',cashReceived:580,items:[{itemKind:'product',productId:product,name:'QA Pizza',quantity:1,unitBasePrice:500,unitModifierPrice:80,unitPrice:580,modifiers:[{groupId,optionId:linked.id,label:linked.name,price:80}]}],replacement:null}
  const sync=checked(await client.rpc('sync_offline_pos_order',{p_payload:payload}),'sync archived add-on')
  assert.equal(Number(sync.total),580,'offline sale must keep its downloaded price after group removal')
  const retry=checked(await client.rpc('sync_offline_pos_order',{p_payload:payload}),'retry offline sale')
  assert.equal(retry.id,sync.id);assert.equal(retry.idempotent,true)
  assert.equal(checked(await service.from('product_modifier_groups').select('*').eq('modifier_group_id',groupId),'assignment removed').length,0)
  assert.equal(checked(await service.from('order_item_modifiers').select('option_name').eq('order_item_id',item.id).single(),'historical choice').option_name,'QA Cold Beverage')
  for(const status of ['CONFIRMED','PREPARING','READY','DELIVERED'])checked(await service.from('orders').update({status}).eq('id',order),`status ${status}`)
  const stock=async()=>Number(checked(await service.from('ingredients').select('current_stock').eq('id',ingredient).single(),'stock').current_stock)
  assert.equal(await stock(),8,'linked product recipe must consume two bottles even after removing group')
  checked(await service.from('orders').update({status:'DELIVERED'}).eq('id',order),'repeat delivered')
  assert.equal(await stock(),8,'inventory must not be consumed twice')
  console.log('PASS: atomic save, tenant isolation, linked price/name/image, option/group archive, historical snapshot, offline sync after removal/retry and idempotent linked inventory.')
} finally {
  // All IDs belong exclusively to this run; cleanup failures surface rather than being hidden.
  await remove('stock_movements','reference_id',order)
  await remove('audit_logs','business_id',business)
  await remove('payment_transactions','business_id',business)
  await remove('invoices','business_id',business)
  await remove('orders','business_id',business)
  await remove('register_shifts','business_id',business)
  await remove('pos_catalog_snapshots','business_id',business)
  await remove('pos_offline_devices','id',deviceId)
  // Deleting a delivered test order restores its stock and records that movement.
  await remove('stock_movements','business_id',business)
  await remove('recipes','business_id',business)
  await remove('ingredients','id',ingredient)
  if(groupId)await remove('modifier_groups','id',groupId)
  await remove('products','business_id',business);await remove('products','business_id',otherBusiness)
  await remove('categories','id',category)
  await remove('categories','business_id',otherBusiness)
  if(userId){await remove('staff_memberships','user_id',userId);checked(await service.auth.admin.deleteUser(userId),'cleanup user')}
  await remove('branches','id',branch)
  await remove('audit_logs','business_id',business)
  await remove('businesses','id',business);await remove('businesses','id',otherBusiness)
  console.log('Isolated restaurant, user, order and catalog fixtures removed.')
}
