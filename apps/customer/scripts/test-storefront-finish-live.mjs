// Explicit live operational QA: creates labelled COD orders, cancels them, retains audit history.
// Credentials and guest tokens are never printed. No emails are sent.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
process.loadEnvFile(new URL('../.env.local',import.meta.url))
const env=process.env, origin='http://localhost:3000', adminOrigin='http://localhost:3001'
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const users=[],createdOrders=[],memberships=[];let staff,channel,stage='setup',failed=false
function checked(result,label){if(result.error)throw new Error(label+' code '+(result.error.code??result.error.status??'unknown'));return result.data}
async function http(path,{person,headers={},...init}={}){const r=await fetch(origin+path,{...init,headers:{...headers,...(person?{Cookie:person.cookie()}:{} )},signal:AbortSignal.timeout(45000)});return {status:r.status,data:await r.json()}}
async function account(namespace,businessId,branchId){
  const email=`qa-finish-${randomUUID()}@example.com`,password=`Qa!${randomUUID()}`
  const user=checked(await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'QA TEST — DO NOT FULFILL'}}),'Create QA user').user;users.push(user.id)
  if(businessId){const m=checked(await db.from('staff_memberships').insert({business_id:businessId,branch_id:branchId,user_id:user.id,role:'MANAGER',is_active:true,permissions_customized:true}).select('id').single(),'Scoped membership');memberships.push(m.id);checked(await db.from('staff_membership_permissions').insert(['orders.read','orders.manage','receipts.print','kds.use','delivery.manage','social.manage'].map(permission_code=>({membership_id:m.id,permission_code}))),'Scoped permissions')}
  const jar=new Map();const client=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:namespace,path:'/',sameSite:'lax'},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:items=>items.forEach(({name,value})=>jar.set(name,value))}})
  checked(await client.auth.signInWithPassword({email,password}),'QA sign-in')
  return {id:user.id,client,cookie:()=>[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}
}
try{
  const branch=checked(await db.from('branches').select('id,business_id,name,latitude,longitude').eq('id','22222222-2222-4222-8222-222222222222').single(),'Branch')
  stage='Google destination and route'
  const details=await http('/api/location/place?placeId=ChIJX6OX0cr-3jgRzRlpc9zQJqc');assert.equal(details.status,200)
  const point=details.data.suggestion.coordinates, params=new URLSearchParams(point)
  const reverse=await http('/api/location/reverse?'+params);assert.equal(reverse.status,200);assert.ok(reverse.data.matchedAreaId)
  const area=checked(await db.from('delivery_areas').select('id,name,slug').eq('branch_id',branch.id).eq('slug',reverse.data.matchedAreaId).single(),'Canonical area')
  params.set('areaId',area.id);const quote=await http('/api/location/route?'+params);assert.equal(quote.status,200)
  console.log(JSON.stringify({stage,origin:{latitude:branch.latitude,longitude:branch.longitude},destination:point,area:area.name,route:quote.data}))
  const outside=await http('/api/location/route?latitude=33.6844&longitude=73.0479');assert.equal(outside.status,422);console.log('PASS outside coverage rejected')
  stage='Resolve real menu product'
  const products=checked(await db.from('products').select('id,name,base_price').eq('business_id',branch.business_id).eq('is_active',true).eq('is_available',true),'Products')
  const assignments=checked(await db.from('product_modifier_groups').select('product_id,modifier_group_id'),'Modifier assignments')
  const product=products.find(p=>!assignments.some(a=>a.product_id===p.id));assert.ok(product,'Real unmodified item available')
  stage='Isolated QA sessions'
  const customer=await account('italian-pizza-customer-auth');staff=await account('italian-pizza-admin-auth',branch.business_id,branch.id)
  const events=[]
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime subscription timeout')),20000);channel=staff.client.channel('qa-finish-'+randomUUID()).on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`business_id=eq.${branch.business_id}`},e=>events.push(e)).subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(new Error('Realtime channel error'))}})})
  console.log('PASS scoped Admin realtime subscription')
  const payload={branchId:branch.id,serviceMode:'DELIVERY',paymentMethod:'CASH_ON_DELIVERY',customerName:'QA TEST — DO NOT FULFILL',customerPhone:'03000000000',customerEmail:'qa-test@example.com',deliveryAreaId:area.id,deliveryAddress:details.data.suggestion.description,deliveryInstructions:'AUTOMATED QA TEST. Do not prepare or dispatch. Will be cancelled.',locationSource:'AUTOCOMPLETE',...point,items:[{productId:product.id,quantity:1}]}
  for(const [label,person] of [['signed-in',customer],['guest',null]]){
    stage=label+' COD order'
    const response=await http('/api/orders',{person,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if(response.status!==201)throw new Error('Place order HTTP '+response.status+': '+response.data.error)
    const order=response.data.order;assert.ok(order.orderNumber)
    const row=checked(await db.from('orders').select('id,order_number,customer_id,status,token_number,channel,latitude,longitude,customer_phone,delivery_instructions,delivery_fee,total,order_items(product_name,quantity)').eq('order_number',order.orderNumber).single(),'Authoritative created order');createdOrders.push(row.id)
    assert.equal(row.customer_id,person?.id??null);assert.equal(row.channel,'WEBSITE');assert.ok(row.token_number);assert.equal(Number(row.delivery_fee),quote.data.deliveryFee);assert.equal(row.order_items.length,1)
    const headers=person?{}:{'X-Order-Token':order.guestTrackingToken};if(!person)assert.ok(order.guestTrackingToken?.length>=32)
    assert.equal((await http('/api/orders/'+order.orderNumber,{person,headers})).status,200)
    assert.equal((await http('/api/orders/'+order.orderNumber)).status,404)
    const deadline=Date.now()+10000;while(!events.some(e=>e.eventType==='INSERT'&&e.new.id===row.id)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200))
    assert.ok(events.some(e=>e.eventType==='INSERT'&&e.new.id===row.id),'Admin realtime INSERT')
    if(person){
      for(const status of ['CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY']){
        checked(await staff.client.from('orders').update({status}).eq('id',row.id).select('id').single(),'Admin '+status)
        const tracking=await http('/api/orders/'+order.orderNumber,{person,headers});assert.equal(tracking.data.order.status,status)
        if(status==='PREPARING'){const kds=checked(await staff.client.from('orders').select('id,token_number,order_items(product_name,quantity,order_item_modifiers(option_name))').eq('id',row.id).in('status',['CONFIRMED','PREPARING']).single(),'KDS query');assert.equal(kds.order_items.length,1)}
      }
      const cancel=await http('/api/orders/'+order.orderNumber+'/cancel',{person,method:'POST'});assert.equal(cancel.status,409)
    }else{
      const cancel=await http('/api/orders/'+order.orderNumber+'/cancel',{headers,method:'POST'});assert.equal(cancel.status,200);assert.equal(cancel.data.ok,true)
    }
    console.log(JSON.stringify({stage,orderId:row.id,orderNumber:order.orderNumber,realtimeInsert:true,trackingAuthorized:true,unauthorizedDenied:true,kitchen:person?'query PASS':'cancelled before kitchen',cancel:person?'closed after Admin progression':'guest window PASS'}))
  }
  stage='Session isolation'
  checked(await customer.client.auth.signOut({scope:'local'}),'Customer local logout');assert.ok((await staff.client.auth.getUser()).data.user);console.log('PASS customer local signout leaves Admin session authenticated')
  stage='Admin route guards'
  for(const path of ['/orders','/kitchen']){const response=await fetch(adminOrigin+path,{headers:{Cookie:staff.cookie()},redirect:'manual',signal:AbortSignal.timeout(45000)});console.log('Admin '+path+' HTTP '+response.status);await response.body?.cancel()}
}catch(error){failed=true;console.error('FAIL '+stage+': '+(error instanceof Error?error.message:'Unknown error'))}
finally{
  if(channel&&staff)await staff.client.removeChannel(channel)
  for(const id of createdOrders){const result=await db.from('orders').update({status:'CANCELLED',cancel_reason:'Automated production-finish QA; not a real customer order',cancelled_by:'ADMIN'}).eq('id',id).neq('status','CANCELLED');if(result.error){failed=true;console.error('QA order cleanup requires review: '+id+' code '+result.error.code)}}
  for(const id of users){const result=await db.auth.admin.deleteUser(id);if(result.error){failed=true;console.error('QA account cleanup failed code '+result.error.code)}}
  console.log('Temporary QA accounts removed; cancelled QA orders and audit history retained.')
}
if(failed)process.exitCode=1
