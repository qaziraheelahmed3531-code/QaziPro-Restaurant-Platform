/* Push only: no tenant HTML/API cache and no request interception. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function safePath(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    if (url.origin !== self.location.origin || url.search || !/^\/(?:orders(?:\/[A-Za-z0-9-]+)?|pages\/[a-z0-9-]+)?$/.test(url.pathname)) return "/";
    return url.pathname + url.hash;
  } catch { return "/"; }
}
self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || data.origin !== self.location.origin) return;
  event.waitUntil(self.registration.showNotification(String(data.title || "Restaurant update").slice(0,140), {
    body:String(data.message || "").slice(0,500),tag:String(data.id || "restaurant-update"),renotify:false,
    data:{path:safePath(data.path)},
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destination = new URL(safePath(event.notification.data?.path),self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing) { await existing.navigate(destination);return existing.focus(); }
    return self.clients.openWindow(destination);
  })());
});
