const deviceKey="qp-browser-device-v1"
export function browserDeviceId() {
  let id=localStorage.getItem(deviceKey)
  if(!id){id=crypto.randomUUID();localStorage.setItem(deviceKey,id)}
  return id
}
export async function unsubscribeBrowserPush() {
  const deviceId=localStorage.getItem(deviceKey)
  if(deviceId){
    const response=await fetch("/api/push",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({deviceId})})
    if(!response.ok)throw Error("Could not remove this browser's notifications. Please retry before signing out.")
  }
  if("serviceWorker" in navigator){
    const registration=await navigator.serviceWorker.getRegistration("/")
    const subscription=await registration?.pushManager.getSubscription()
    if (subscription && !await subscription.unsubscribe()) {
      throw Error("Notifications are disabled for your account, but this browser could not remove its subscription. Please retry.")
    }
  }
  localStorage.removeItem("qp-browser-push-owner")
}
