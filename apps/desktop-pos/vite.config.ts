import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({mode})=>{
  const adminEnv=loadEnv(mode,"../admin","")
  const configured=(name:string,fallback="")=>process.env[name]?.trim()||adminEnv[name]?.trim()||fallback
  const customerUrl=configured("CUSTOMER_APP_URL","http://localhost:3000")
  const adminUrl=configured("ADMIN_APP_URL","http://127.0.0.1:3001").replace("http://localhost:","http://127.0.0.1:")
  const supabaseUrl=configured("NEXT_PUBLIC_SUPABASE_URL")
  const supabaseKey=configured("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",configured("NEXT_PUBLIC_SUPABASE_ANON_KEY"))
  if(process.env.DESKTOP_STAGING_BUILD==="true"&&supabaseUrl!=="https://jzisqjvroxodvmqxzsob.supabase.co")throw new Error("Staging desktop build must use the verified staging database.")
  if(process.env.DESKTOP_RELEASE_BUILD==="true"){
    for(const [name,value] of [["CUSTOMER_APP_URL",customerUrl],["ADMIN_APP_URL",adminUrl],["NEXT_PUBLIC_SUPABASE_URL",supabaseUrl],["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",supabaseKey]]){
      if(!value)throw new Error(`${name} is required for a Desktop POS release build.`)
    }
    for(const [name,value] of [["CUSTOMER_APP_URL",customerUrl],["ADMIN_APP_URL",adminUrl],["NEXT_PUBLIC_SUPABASE_URL",supabaseUrl]]){
      const url=new URL(value)
      if(url.protocol!=="https:"||["localhost","127.0.0.1","::1"].includes(url.hostname))throw new Error(`${name} must be a non-local HTTPS URL for a Desktop POS release build.`)
    }
  }
  return {base:"./",plugins:[react(),{name:"desktop-trusted-runtime",generateBundle(){this.emitFile({type:"asset",fileName:"desktop-runtime.json",source:JSON.stringify({channel:process.env.DESKTOP_STAGING_BUILD==="true"?"staging":"production",customerUrl,adminUrl,updateUrl:configured("DESKTOP_UPDATE_URL"),updatePublisher:configured("DESKTOP_UPDATE_PUBLISHER")})})}}],resolve:{dedupe:["react","react-dom"]},define:{
    "import.meta.env.VITE_SUPABASE_URL":JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_KEY":JSON.stringify(supabaseKey),
    "import.meta.env.VITE_CUSTOMER_APP_URL":JSON.stringify(customerUrl),
    "import.meta.env.VITE_ADMIN_APP_URL":JSON.stringify(adminUrl),
  },build:{outDir:"dist",emptyOutDir:true}}
})
