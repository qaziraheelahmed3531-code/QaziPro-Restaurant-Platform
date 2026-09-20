/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_CUSTOMER_APP_URL:string; readonly VITE_ADMIN_APP_URL:string }
interface ImportMeta { readonly env:ImportMetaEnv }
interface Window { desktopPOS?: { meta:()=>Promise<{version:string;platform:string;deviceName:string}>;protect:(value:string)=>Promise<string|null>;print:()=>Promise<boolean>;openOAuth:(url:string)=>Promise<boolean>;setBranding:(dataUrl:string,name:string,businessId?:string)=>Promise<boolean>;notify:(value:{title:string;body:string;orderId:string})=>Promise<boolean>;onNotificationOpen:(callback:(orderId:string)=>void)=>()=>void;onOAuthCallback:(callback:(url:string)=>void)=>()=>void } }
