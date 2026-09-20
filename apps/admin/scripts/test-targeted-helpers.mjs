import assert from 'node:assert/strict'
import { mediaUrlError, mediaFileError, mediaSignatureError, mediaPreviewUrl } from '../lib/media.ts'
import { invoiceTotals, invoiceDraft } from '../lib/invoices.ts'

for (const value of ['', '/images/meal.webp','/images/my%20meal.png','https://cdn.example.test/image?width=1200','https://example.supabase.co/storage/v1/object/public/product-images/test.png']) assert.equal(mediaUrlError(value),null,value)
for (const value of ['//evil.test/x.png','javascript:alert(1)','data:image/svg+xml,x','https://user:password@example.test/image','/../.env','/%2e%2e/.env','/%252e%252e/.env','/%2f%2fevil.test/x','/images\\x.png','http://remote.test/x']) assert.ok(mediaUrlError(value),value)
assert.equal(mediaPreviewUrl('/images/test.png','http://localhost:3000'),'http://localhost:3000/images/test.png')
assert.equal(mediaFileError({name:'real.png',type:'image/png',size:1024}),null)
assert.ok(mediaFileError({name:'fake.svg',type:'image/png',size:1024}))
assert.ok(mediaFileError({name:'large.png',type:'image/png',size:11*1024*1024}))
assert.ok(mediaFileError({name:'empty.png',type:'image/png',size:0}))
const png=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'real.png',{type:'image/png'})
assert.equal(await mediaSignatureError(png),null)
assert.ok(await mediaSignatureError(new File(['<svg/>'],'fake.png',{type:'image/png'})))
const lines=[{description:'A',quantity:2,unit_price:500,discount:100,tax:30},{description:'B',quantity:1,unit_price:300,discount:0,tax:0}]
assert.deepEqual(invoiceTotals(lines,50,20,100),{subtotal:1300,discount:150,tax:50,charges:100,total:1300})
assert.equal(invoiceTotals([{description:'fractional',quantity:1.125,unit_price:101,discount:0,tax:0}]).total,114)
const draft=invoiceDraft({lines,discount:150,tax:50})
assert.equal(draft.discount,50);assert.equal(draft.tax,20)
console.log('PASS: media URL/path validation, format/extension/size/signature checks, customer asset preview URLs, invoice rounding and draft/totals consistency')
