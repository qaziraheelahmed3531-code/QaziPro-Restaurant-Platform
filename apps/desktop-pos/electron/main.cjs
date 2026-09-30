const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  nativeImage,
  Notification,
  screen,
} = require("electron")
const path = require("node:path")
const fs = require("node:fs")
const crypto = require("node:crypto")
const { pathToFileURL } = require("node:url")
const { createSecureStore } = require("./secure-store.cjs")
const { createPrinterAdapter } = require("./printer-adapter.cjs")
const { createTicketPrinter } = require("./ticket-printer.cjs")
const ticketPrinter=createTicketPrinter({createWindow:()=>new BrowserWindow({show:false,width:400,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}})})
const { createUpdateAdapter } = require("./update-adapter.cjs")
const runtime=JSON.parse(fs.readFileSync(path.join(__dirname,"../dist/desktop-runtime.json"),"utf8"))
let updater
const updates=()=>{
 if(updater)return updater
 const configured=app.isPackaged&&process.platform==='win32'&&runtime.updatePublisher&&runtime.updateUrl&&new URL(runtime.updateUrl).protocol==='https:'
 let driver
 if(configured){
  const {NsisUpdater}=require('electron-updater')
  const {verifySignature}=require('electron-updater/out/windowsExecutableCodeSignatureVerifier')
  const logger={info:()=>{},warn:()=>{},error:()=>{},debug:()=>{}}
  // electron-updater 6 silently skips Authenticode if app-update.yml has no
  // publisherName. Pin the packaged publisher and fail closed instead.
  class SignedUpdater extends NsisUpdater {verifySignature(file){return verifySignature([runtime.updatePublisher],file,logger)}}
  driver=new SignedUpdater({provider:'generic',url:runtime.updateUrl});driver.logger=logger
 }
 updater=createUpdateAdapter({driver,configured:Boolean(configured)});return updater
}
const printerAdapters=new WeakMap()
const printerFor=contents=>{
  if(!printerAdapters.has(contents))printerAdapters.set(contents,createPrinterAdapter(contents))
  return printerAdapters.get(contents)
}

const baseName = "QaziPRO POS Desktop"
const baseAppId = "pk.qazipro.desktoppos"
app.setName(baseName)
app.setAppUserModelId(baseAppId)

// Native smoke tests use a disposable profile and never register OS protocols.
const smokeMode=(!app.isPackaged || runtime.channel === "staging") && process.argv.includes("--desktop-smoke")
if (smokeMode) {
  const isolated = path.resolve(app.commandLine.getSwitchValue("user-data-dir"))
  const temporary = path.resolve(require("node:os").tmpdir()) + path.sep
  if (!isolated.toLowerCase().startsWith(temporary.toLowerCase()) || !path.basename(isolated).startsWith("qazipro-native-test-"))
    throw new Error("Native verification requires an isolated temporary profile")
  app.setPath("userData", isolated)
}

const userDataPath = app.getPath("userData")
let keyDurability
const ensureKeyDurable=()=>{
  if(process.platform!=="win32")return Promise.resolve()
  if(!keyDurability)keyDurability=(async()=>{
    const file=path.join(userDataPath,"Local State"),deadline=Date.now()+30_000
    while(Date.now()<deadline){
      try{
        const state=JSON.parse(await fs.promises.readFile(file,"utf8"))
        if(state.os_crypt?.encrypted_key){
          const handle=await fs.promises.open(file,"r+");try{await handle.sync()}finally{await handle.close()}
          return
        }
      }catch(error){if(error.code&&error.code!=="ENOENT")throw error}
      await new Promise(resolve=>setTimeout(resolve,100))
    }
    throw Error("Secure profile setup has not finished. Keep the app open and retry sign-in.")
  })().catch(error=>{keyDurability=null;throw error})
  return keyDurability
}
const credentials = createSecureStore(path.join(userDataPath, "credentials"), safeStorage,ensureKeyDurable)
const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
  ? new URL(process.env.ELECTRON_RENDERER_URL).href
  : pathToFileURL(path.join(__dirname, "../dist/index.html")).href
if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL &&
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(rendererUrl))
  throw new Error("Development renderer must use localhost")
const trustedRenderer = (url) => {
  try { const parsed = new URL(url); parsed.hash = ""; parsed.search = ""; return parsed.href === rendererUrl }
  catch { return false }
}
const handle = (channel, listener) => ipcMain.handle(channel, (event, ...args) => {
  if (!mainWindow || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame || !trustedRenderer(event.senderFrame.url))
    throw new Error("Untrusted desktop request")
  return listener(event, ...args)
})
const brandFile = () => path.join(userDataPath, "restaurant-brand.json")
const restaurantPng = () => path.join(userDataPath, "restaurant-icon.png")
const restaurantIco = () => path.join(userDataPath, "restaurant-icon.ico")
const qaziproIco = () => path.join(userDataPath, "qazipro-icon.ico")
const restaurantAppId = (value, fingerprint) =>
  `pk.qazipro.desktoppos.restaurant.${crypto
    .createHash("sha256")
    .update(`${String(value ?? "restaurant")}:${String(fingerprint ?? "")}`)
    .digest("hex")
    .slice(0, 16)}`

const writeWindowsIcon = (pngBuffer, file) => {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header.writeUInt8(0, 6)
  header.writeUInt8(0, 7)
  header.writeUInt8(0, 8)
  header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(pngBuffer.length, 14)
  header.writeUInt32LE(22, 18)
  fs.writeFileSync(file, Buffer.concat([header, pngBuffer]))
}

const packagedIcon = path.join(__dirname, "../build/icon.png")
const ensureQaziProIcon = () => {
  const file = qaziproIco()
  if (!fs.existsSync(file) && fs.existsSync(packagedIcon)) {
    const icon = nativeImage
      .createFromPath(packagedIcon)
      .resize({ width: 256, height: 256, quality: "best" })
    if (!icon.isEmpty()) writeWindowsIcon(icon.toPNG(), file)
  }
  return fs.existsSync(file) ? file : packagedIcon
}

const protocols = ["qazipro-pos", "italianpizza-pos"]
for (const protocol of (smokeMode ? [] : protocols)) {
  if (process.defaultApp && process.argv[1])
    app.setAsDefaultProtocolClient(protocol, process.execPath, [
      path.resolve(process.argv[1]),
    ])
  else app.setAsDefaultProtocolClient(protocol)
}

let mainWindow = null
let pendingOAuthUrl = null
let activeBrand = {
  key: "base",
  name: baseName,
  appId: baseAppId,
  iconPath: null,
}

const isOAuthUrl = (value) => {
 try{const url=new URL(value);return protocols.includes(url.protocol.slice(0,-1))&&url.hostname==='auth'&&url.pathname==='/callback'&&!url.username&&!url.password&&String(value).length<24000}catch{return false}
}
const oauthArgument = (argv) => argv.find(isOAuthUrl)
const deliverOAuth = (url) => {
  if (!isOAuthUrl(url)) return
  pendingOAuthUrl = url
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:oauth-callback", url)
    pendingOAuthUrl = null
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else
  app.on("second-instance", (_event, argv) =>
    deliverOAuth(oauthArgument(argv)),
  )
app.on("open-url", (event, url) => {
  event.preventDefault()
  deliverOAuth(url)
})

const windowTitle = () =>
  activeBrand.key === "base"
    ? baseName
    : `${activeBrand.name} \u2014 Offline POS`

const applyWindowsTaskbarIdentity = (window, title, iconPath) => {
  if (process.platform !== "win32" || typeof window.setAppDetails !== "function")
    return
  window.setAppDetails({
    appId: activeBrand.appId,
    appIconPath: iconPath,
    appIconIndex: 0,
    relaunchDisplayName: title,
  })
}

const createWindow = (options = {}) => {
  if (!activeBrand.iconPath) activeBrand.iconPath = ensureQaziProIcon()
  const iconPath =
    activeBrand.iconPath && fs.existsSync(activeBrand.iconPath)
      ? activeBrand.iconPath
      : packagedIcon
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : null
  const title = windowTitle()
  const shouldMaximize = options.maximized ?? true
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const window = new BrowserWindow({
    title,
    width: Math.min(1500, width),
    height: Math.min(940, height),
    minWidth: 360,
    minHeight: 420,
    show: false,
    backgroundColor: "#f5f6f8",
    autoHideMenuBar: true,
    ...(options.bounds
      ? {
          x: options.bounds.x,
          y: options.bounds.y,
          width: options.bounds.width,
          height: options.bounds.height,
        }
      : {}),
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window
  applyWindowsTaskbarIdentity(window, title, iconPath)
  window.on("page-title-updated", (event) => {
    event.preventDefault()
    window.setTitle(windowTitle())
  })
  window.once("ready-to-show", () => {
    if (shouldMaximize) window.maximize()
    if (options.replaceWindow && !options.replaceWindow.isDestroyed())
      options.replaceWindow.destroy()
    window.show()
  })
  window.webContents.once("did-finish-load", () => {
    if (pendingOAuthUrl) {
      window.webContents.send("desktop:oauth-callback", pendingOAuthUrl)
      pendingOAuthUrl = null
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) return
    if (input.key === "F11") {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    } else if (input.key === "Escape" && window.isFullScreen()) {
      window.setFullScreen(false)
    }
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (!trustedRenderer(url)) event.preventDefault()
  })
  void window.loadURL(rendererUrl)
}

handle("desktop:meta", () => ({
  version: app.getVersion(),
  platform: process.platform,
  deviceName: require("node:os").hostname(),
}))
handle("desktop:protect", (_event, value) =>
  safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(String(value)).toString("base64")
    : null,
)
handle("desktop:credentials-get", (_event, key) => credentials.get(key))
handle("desktop:credentials-set", (_event, key, value) => credentials.set(key, value))
handle("desktop:credentials-remove", (_event, key) => credentials.remove(key))
handle("desktop:update-status",()=>updates().status())
handle("desktop:update-safety",(_event,safe)=>{updates().setSafety(safe);return true})
handle("desktop:update-action",(_event,action)=>updates().run(action))
handle("desktop:fullscreen",()=>{mainWindow.setFullScreen(!mainWindow.isFullScreen());return mainWindow.isFullScreen()})
handle("desktop:printers", async (event) =>
  printerFor(event.sender).list())
handle("desktop:print-receipt", (event,options)=>printerFor(event.sender).print(options))
handle("desktop:print-ticket",(_event,payload)=>ticketPrinter.print(payload))
handle(
  "desktop:print",
  (event) =>
    new Promise((resolve) => {
      if (event.sender.isDestroyed()) return resolve(false)
      event.sender.print(
        { silent: false, printBackground: true },
        (success) => resolve(success),
      )
    }),
)
handle("desktop:oauth-open", async (_event, value) => {
  const url = new URL(String(value))
  const safeLocal =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  if ((url.protocol !== "https:" && !safeLocal)||url.origin!==new URL(runtime.customerUrl).origin||url.pathname!=="/desktop-pos-auth"||url.username||url.password)
    throw new Error("Invalid sign-in URL")
  await shell.openExternal(url.toString())
  return true
})

handle("desktop:set-branding", (_event, value, name, businessId) => {
  const data = String(value ?? "")
  if (!/^data:image\/png;base64,/.test(data) || data.length > 3_000_000)
    return false
  const source = nativeImage.createFromDataURL(data)
  if (source.isEmpty()) return false
  const icon = source.resize({ width: 256, height: 256, quality: "best" })
  const title = String(name ?? "").trim().slice(0, 100)
  const tenant = String(businessId ?? "").trim().slice(0, 100)
  const file = restaurantPng()
  const icoFile = restaurantIco()
  let nextBrand

  if (tenant) {
    const png = icon.toPNG()
    const fingerprint = crypto
      .createHash("sha256")
      .update(png)
      .digest("hex")
      .slice(0, 16)
    fs.writeFileSync(file, png)
    writeWindowsIcon(png, icoFile)
    fs.writeFileSync(
      brandFile(),
      JSON.stringify({
        name: title || "Restaurant",
        businessId: tenant,
        fingerprint,
      }),
      "utf8",
    )
    nextBrand = {
      key: `restaurant:${tenant}:${fingerprint}`,
      name: title || "Restaurant",
      appId: restaurantAppId(tenant, fingerprint),
      iconPath: icoFile,
    }
  } else {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      if (fs.existsSync(icoFile)) fs.unlinkSync(icoFile)
      if (fs.existsSync(brandFile())) fs.unlinkSync(brandFile())
    } catch {}
    nextBrand = {
      key: "base",
      name: baseName,
      appId: baseAppId,
      iconPath: ensureQaziProIcon(),
    }
  }

  activeBrand = nextBrand
  app.setAppUserModelId(activeBrand.appId)
  // Branding must never recreate the renderer: an in-progress cart is valuable.
  if (mainWindow && !mainWindow.isDestroyed()) {
    const activeIcon = nativeImage.createFromPath(activeBrand.iconPath)
    if (!activeIcon.isEmpty()) mainWindow.setIcon(activeIcon)
    const title = windowTitle()
    mainWindow.setTitle(title)
    applyWindowsTaskbarIdentity(mainWindow, title, activeBrand.iconPath)
  }
  return true
})

handle("desktop:notify", (_event, value) => {
  if (!Notification.isSupported()) return false
  const title = String(value?.title ?? "New website order").slice(0, 100)
  const body = String(value?.body ?? "").slice(0, 240)
  const orderId = String(value?.orderId ?? "").slice(0, 80)
  const iconPath = restaurantPng()
  const notice = new Notification({
    title,
    body,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
  })
  notice.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send("desktop:notification-open", orderId)
    }
  })
  notice.show()
  return true
})

app.whenReady().then(() => {
  // Test-only transport outage, installed before any renderer can issue a
  // request. Available solely in the validated disposable smoke profile.
  if (smokeMode && process.argv.includes("--desktop-smoke-offline")) {
    require("electron").session.defaultSession.webRequest.onBeforeRequest(
      {urls:["http://*/*","https://*/*"]}, (_details, callback) => callback({cancel:true}))
  }
  deliverOAuth(oauthArgument(process.argv))
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
