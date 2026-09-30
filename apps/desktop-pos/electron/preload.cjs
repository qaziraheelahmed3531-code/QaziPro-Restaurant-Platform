const {contextBridge,ipcRenderer}=require("electron")
// Each operation has a dedicated, sender-validated IPC endpoint.
const credentials = {get:key=>ipcRenderer.invoke("desktop:credentials-get",key),set:(key,value)=>ipcRenderer.invoke("desktop:credentials-set",key,value),remove:key=>ipcRenderer.invoke("desktop:credentials-remove",key)}
contextBridge.exposeInMainWorld("desktopCredentials",credentials)
contextBridge.exposeInMainWorld("desktopPrinters",()=>ipcRenderer.invoke("desktop:printers"))
contextBridge.exposeInMainWorld("desktopPrintReceipt",options=>ipcRenderer.invoke("desktop:print-receipt",options))
contextBridge.exposeInMainWorld("desktopUpdates",{status:()=>ipcRenderer.invoke("desktop:update-status"),safety:safe=>ipcRenderer.invoke("desktop:update-safety",safe),run:action=>ipcRenderer.invoke("desktop:update-action",action)})
contextBridge.exposeInMainWorld("desktopFullscreen",()=>ipcRenderer.invoke("desktop:fullscreen"))
contextBridge.exposeInMainWorld("desktopPOS",{meta:()=>ipcRenderer.invoke("desktop:meta"),protect:value=>ipcRenderer.invoke("desktop:protect",value),print:()=>ipcRenderer.invoke("desktop:print"),openOAuth:url=>ipcRenderer.invoke("desktop:oauth-open",url),setBranding:(dataUrl,name,businessId)=>ipcRenderer.invoke("desktop:set-branding",dataUrl,name,businessId),notify:value=>ipcRenderer.invoke("desktop:notify",value),onNotificationOpen:callback=>{const listener=(_event,orderId)=>callback(orderId);ipcRenderer.on("desktop:notification-open",listener);return()=>ipcRenderer.removeListener("desktop:notification-open",listener)},onOAuthCallback:callback=>{const listener=(_event,url)=>callback(url);ipcRenderer.on("desktop:oauth-callback",listener);return()=>ipcRenderer.removeListener("desktop:oauth-callback",listener)}})
