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

const baseName = "QaziPRO POS Desktop"
const baseAppId = "pk.qazipro.desktoppos"
app.setName(baseName)
app.setAppUserModelId(baseAppId)

const userDataPath = app.getPath("userData")
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
for (const protocol of protocols) {
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

const isOAuthUrl = (url) =>
  protocols.some((protocol) => url?.startsWith(`${protocol}://`))
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
    window.setTitle(title)
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
  const renderer = process.env.ELECTRON_RENDERER_URL
  if (renderer) void window.loadURL(renderer)
  else void window.loadFile(path.join(__dirname, "../dist/index.html"))
}

const replaceMainWindow = () => {
  const previous = mainWindow
  if (!previous || previous.isDestroyed()) {
    createWindow()
    return
  }
  createWindow({
    bounds: previous.getBounds(),
    maximized: previous.isMaximized(),
    replaceWindow: previous,
  })
}

ipcMain.handle("desktop:meta", () => ({
  version: app.getVersion(),
  platform: process.platform,
  deviceName: require("node:os").hostname(),
}))
ipcMain.handle("desktop:protect", (_event, value) =>
  safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(String(value)).toString("base64")
    : null,
)
ipcMain.handle(
  "desktop:print",
  (event) =>
    new Promise((resolve) =>
      BrowserWindow.fromWebContents(event.sender)?.webContents.print(
        { silent: false, printBackground: true },
        (success) => resolve(success),
      ),
    ),
)
ipcMain.handle("desktop:oauth-open", async (_event, value) => {
  const url = new URL(String(value))
  const safeLocal =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  if (url.protocol !== "https:" && !safeLocal)
    throw new Error("Invalid sign-in URL")
  await shell.openExternal(url.toString())
  return true
})

ipcMain.handle("desktop:set-branding", (_event, value, name, businessId) => {
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

  const identityChanged = activeBrand.key !== nextBrand.key
  activeBrand = nextBrand
  app.setName(activeBrand.name)
  app.setAppUserModelId(activeBrand.appId)
  if (identityChanged) setImmediate(replaceMainWindow)
  else if (mainWindow && !mainWindow.isDestroyed()) {
    const activeIcon = nativeImage.createFromPath(activeBrand.iconPath)
    if (!activeIcon.isEmpty()) mainWindow.setIcon(activeIcon)
    const title = windowTitle()
    mainWindow.setTitle(title)
    applyWindowsTaskbarIdentity(mainWindow, title, activeBrand.iconPath)
  }
  return true
})

ipcMain.handle("desktop:notify", (_event, value) => {
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
  deliverOAuth(oauthArgument(process.argv))
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
