/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_CUSTOMER_APP_URL:string; readonly VITE_ADMIN_APP_URL:string }
interface ImportMeta { readonly env:ImportMetaEnv }
interface Window {
  desktopPrintTicket?:(payload:{deviceName:string;ticket:import("./types").KitchenTicket})=>Promise<{status:"SUBMITTED"|"CANCELLED"|"FAILED"|"UNKNOWN"|"BUSY";message:string}>;
  desktopUpdates?:{status:()=>Promise<{status:string;message:string;version?:string}>;safety:(safe:boolean)=>Promise<boolean>;run:(action:"check"|"download"|"install")=>Promise<{status:string;message:string;version?:string}>};
  desktopFullscreen?:()=>Promise<boolean>;
  desktopCredentials?: { get:(key:string)=>Promise<string|null>; set:(key:string,value:string)=>Promise<void>; remove:(key:string)=>Promise<void> };
  desktopPrinters?:()=>Promise<Array<{name:string;displayName:string;isDefault:boolean;status:number}>>;
  desktopPrintReceipt?:(options:{deviceName?:string})=>Promise<{status:"SUBMITTED"|"CANCELLED"|"FAILED"|"UNKNOWN"|"BUSY";message:string}>;
}
interface Window { desktopPOS?: { meta:()=>Promise<{version:string;platform:string;deviceName:string}>;protect:(value:string)=>Promise<string|null>;print:()=>Promise<boolean>;openOAuth:(url:string)=>Promise<boolean>;setBranding:(dataUrl:string,name:string,businessId?:string)=>Promise<boolean>;notify:(value:{title:string;body:string;orderId:string})=>Promise<boolean>;onNotificationOpen:(callback:(orderId:string)=>void)=>()=>void;onOAuthCallback:(callback:(url:string)=>void)=>()=>void } }
