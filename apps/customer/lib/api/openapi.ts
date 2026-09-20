import "server-only"

const restaurant={name:"x-qazipro-restaurant",in:"header",required:false,schema:{type:"string"},description:"Public restaurant slug. Required when the API hostname is not mapped to a restaurant."}
const branch={name:"x-qazipro-branch-id",in:"header",required:true,schema:{type:"string",format:"uuid"}}
const requestId={name:"x-request-id",in:"header",required:false,schema:{type:"string",minLength:8,maxLength:100}}
const standard=[restaurant,requestId]
const secured={security:[{bearerAuth:[]}]}
const response={"200":{description:"Success",content:{"application/json":{schema:{$ref:"#/components/schemas/Success"}}}},"400":{$ref:"#/components/responses/Error"},"401":{$ref:"#/components/responses/Error"},"404":{$ref:"#/components/responses/Error"},"422":{$ref:"#/components/responses/Error"},"429":{$ref:"#/components/responses/Error"},"503":{$ref:"#/components/responses/Error"}}
const operation=(summary:string,parameters:unknown[]=standard,extra:Record<string,unknown>={})=>({summary,parameters,responses:response,...extra})

export const mobileOpenApi={
  openapi:"3.1.0",
  info:{title:"QaziPro Restaurant Mobile API",version:"1.0.0",description:"Frozen v1 boundary for white-label Android and iOS clients. Server/database totals are authoritative."},
  servers:[{url:"{baseUrl}/api/v1",variables:{baseUrl:{default:"https://qazipro-restaurant-customer-staging.vercel.app"}}}],
  paths:{
    "/health":{get:operation("Service health",[requestId])},
    "/openapi":{get:operation("This OpenAPI document",[requestId])},
    "/bootstrap":{get:operation("Resolve a public restaurant key and return safe app configuration")},
    "/branches":{get:operation("List active restaurant branches")},
    "/branches/{id}":{get:operation("Validate/select a branch",[...standard,{name:"id",in:"path",required:true,schema:{type:"string",format:"uuid"}}])},
    "/catalog":{get:operation("Branch-aware catalog, variants and modifiers",[...standard,branch])},
    "/payments":{get:operation("Safe enabled payment methods")},
    "/profile":{get:operation("Current customer profile",standard,secured),patch:operation("Update current customer profile",standard,{...secured,requestBody:{$ref:"#/components/requestBodies/JsonBody"}})},
    "/addresses":{get:operation("Paginated saved addresses",standard,secured),post:operation("Create and validate an address",[...standard,branch],{...secured,requestBody:{$ref:"#/components/requestBodies/JsonBody"}})},
    "/addresses/{id}":{patch:operation("Update an address",[...standard,branch,{name:"id",in:"path",required:true,schema:{type:"string",format:"uuid"}}],{...secured,requestBody:{$ref:"#/components/requestBodies/JsonBody"}}),delete:operation("Delete an address",[...standard,{name:"id",in:"path",required:true,schema:{type:"string",format:"uuid"}}],secured)},
    "/addresses/{id}/default":{post:operation("Set default address",[...standard,{name:"id",in:"path",required:true,schema:{type:"string",format:"uuid"}}],secured)},
    "/location/autocomplete":{get:operation("Address autocomplete",[...standard,branch,{name:"q",in:"query",required:true,schema:{type:"string"}}])},
    "/location/reverse":{get:operation("Reverse geocode a pin",[...standard,branch,{name:"latitude",in:"query",required:true,schema:{type:"number"}},{name:"longitude",in:"query",required:true,schema:{type:"number"}}])},
    "/delivery/quote":{get:operation("Validate coverage and quote route",[...standard,branch,{name:"latitude",in:"query",required:true,schema:{type:"number"}},{name:"longitude",in:"query",required:true,schema:{type:"number"}}])},
    "/promotions":{get:operation("List currently active offers")},
    "/promotions/validate":{post:operation("Validate a coupon; final discount is computed during checkout",[...standard,branch],{requestBody:{$ref:"#/components/requestBodies/JsonBody"}})},
    "/orders":{get:operation("Paginated customer order history",standard,secured),post:operation("Create an authoritative idempotent order",[...standard,branch],{requestBody:{$ref:"#/components/requestBodies/JsonBody"}})},
    "/orders/{orderNumber}":{get:operation("Authenticated or guest-token order detail",[...standard,{name:"orderNumber",in:"path",required:true,schema:{type:"string"}},{name:"x-order-token",in:"header",required:false,schema:{type:"string"}}])},
    "/orders/{orderNumber}/tracking":{get:operation("Authenticated or guest-token tracking",[...standard,{name:"orderNumber",in:"path",required:true,schema:{type:"string"}},{name:"x-order-token",in:"header",required:false,schema:{type:"string"}}])},
    "/orders/{orderNumber}/cancel":{post:operation("Legally permitted customer cancellation",[...standard,{name:"orderNumber",in:"path",required:true,schema:{type:"string"}},{name:"x-order-token",in:"header",required:false,schema:{type:"string"}}])},
    "/favourites":{get:operation("Paginated favourites",standard,secured),post:operation("Add favourite",standard,{...secured,requestBody:{$ref:"#/components/requestBodies/JsonBody"}}),delete:operation("Remove favourite",[...standard,{name:"productId",in:"query",required:true,schema:{type:"string",format:"uuid"}}],secured)},
    "/loyalty":{get:operation("Loyalty balance and history",standard,secured)},
    "/devices":{get:operation("List current user's device registrations",standard,secured),post:operation("Register or rotate a push token",standard,{...secured,requestBody:{$ref:"#/components/requestBodies/JsonBody"}}),delete:operation("Unregister a device",[...standard,{name:"deviceId",in:"query",required:true,schema:{type:"string"}}],secured)},
    "/auth/session":{get:operation("Validate current bearer session",standard,secured)},
    "/auth/logout":{post:operation("Revoke current session globally",standard,secured)},
    "/auth/password-reset":{post:operation("Request enumeration-safe password reset",standard,{requestBody:{$ref:"#/components/requestBodies/JsonBody"}})},
    "/auth/deep-links":{get:operation("Environment-aware callback and route templates")},
  },
  components:{
    securitySchemes:{bearerAuth:{type:"http",scheme:"bearer",bearerFormat:"Supabase JWT"}},
    requestBodies:{JsonBody:{required:true,content:{"application/json":{schema:{type:"object"}}}}},
    responses:{Error:{description:"Standard error envelope",content:{"application/json":{schema:{$ref:"#/components/schemas/Failure"}}}}},
    schemas:{
      Meta:{type:"object",required:["version","requestId"],properties:{version:{const:"v1"},requestId:{type:"string"},nextCursor:{type:["string","null"]}}},
      Success:{type:"object",required:["ok","data","meta"],properties:{ok:{const:true},data:{},meta:{$ref:"#/components/schemas/Meta"}}},
      Failure:{type:"object",required:["ok","error","meta"],properties:{ok:{const:false},error:{type:"object",required:["code","message"],properties:{code:{type:"string"},message:{type:"string"},details:{}}},meta:{$ref:"#/components/schemas/Meta"}}},
    },
  },
} as const
