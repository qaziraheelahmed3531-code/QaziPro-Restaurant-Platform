import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({mode})=>{
  const adminEnv=loadEnv(mode,"../admin","")
  const localApi=(adminEnv.ADMIN_APP_URL??"http://127.0.0.1:3001").replace("http://localhost:","http://127.0.0.1:")
  return {base:"./",plugins:[react()],define:{
    "import.meta.env.VITE_SUPABASE_URL":JSON.stringify(adminEnv.NEXT_PUBLIC_SUPABASE_URL??""),
    "import.meta.env.VITE_SUPABASE_KEY":JSON.stringify(adminEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??adminEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY??""),
    "import.meta.env.VITE_CUSTOMER_APP_URL":JSON.stringify(adminEnv.CUSTOMER_APP_URL??"http://localhost:3000"),
    "import.meta.env.VITE_ADMIN_APP_URL":JSON.stringify(localApi),
  },build:{outDir:"dist",emptyOutDir:true}}
})
