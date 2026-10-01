import Image from "next/image"
import Link from "next/link"
import QRCode from "qrcode"
import { AppWindow, BadgeCheck, Download, LockKeyhole, Smartphone, Tablet } from "lucide-react"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

type Release = {
  platform: "Android" | "iOS"
  status: "READY" | "PENDING"
  channel: string
  url: string | null
  detail: string
}

function safeReleaseUrl(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

async function withQr(release: Release) {
  if (!release.url) return { ...release, qr: null }
  const svg = await QRCode.toString(release.url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  })
  return { ...release, qr: `data:image/svg+xml,${encodeURIComponent(svg)}` }
}

export default async function AppsPage() {
  const context = await requirePermission("staff.manage")
  const db = await createClient()
  const [{ data: memberships }, android, ios] = await Promise.all([
    db.from("staff_memberships")
      .select("role,is_active")
      .eq("business_id", context.businessId),
    withQr({
      platform: "Android",
      status: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_ANDROID_APK_URL) || safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_ANDROID_PLAY_URL) ? "READY" : "PENDING",
      channel: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_ANDROID_APK_URL) ? "Staging APK" : "Google Play",
      url: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_ANDROID_APK_URL) || safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_ANDROID_PLAY_URL),
      detail: "Android phones and tablets. APK installs directly; AAB is delivered through Google Play.",
    }),
    withQr({
      platform: "iOS",
      status: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_IOS_TESTFLIGHT_URL) || safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_IOS_APP_STORE_URL) ? "READY" : "PENDING",
      channel: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_IOS_TESTFLIGHT_URL) ? "TestFlight" : "App Store",
      url: safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_IOS_TESTFLIGHT_URL) || safeReleaseUrl(process.env.QAZIPRO_OPERATIONS_IOS_APP_STORE_URL),
      detail: "iPhone and iPad. Installation uses TestFlight or the App Store; iOS does not support a public direct APK-style install.",
    }),
  ])
  const active = (memberships ?? []).filter((membership) => membership.is_active)
  const roleCount = (role: string) => active.filter((membership) => membership.role === role).length
  const releases = [android, ios]

  return <main className="apps-access-page">
    <header className="page-heading">
      <div><span className="eyebrow">ONE APP · ROLE-BASED ACCESS</span><h1>Apps & access</h1><p>Distribute the QaziPro Operations app and control exactly what each staff member can open.</p></div>
      <AppWindow aria-hidden="true" />
    </header>

    <section className="apps-access-summary" aria-label="Mobile access summary">
      <article><BadgeCheck aria-hidden="true"/><span><small>Restaurant Admin</small><strong>{roleCount("OWNER") + roleCount("MANAGER")} active</strong></span></article>
      <article><Tablet aria-hidden="true"/><span><small>Waiter</small><strong>{roleCount("WAITER")} active</strong></span></article>
      <article><Smartphone aria-hidden="true"/><span><small>Rider</small><strong>{roleCount("RIDER")} active</strong></span></article>
    </section>

    <section className="apps-access-grid">
      <div className="apps-access-panel">
        <div className="apps-access-panel__heading"><div><span className="eyebrow">ACCESS</span><h2>How staff gets the correct app</h2></div><LockKeyhole aria-hidden="true"/></div>
        <ol className="apps-access-steps">
          <li><b>1</b><span><strong>Enable the service</strong><small>QaziPro Super Admin enables Mobile Android/iOS plus Admin, Waiter or Rider entitlement for this restaurant.</small></span></li>
          <li><b>2</b><span><strong>Assign staff role and branches</strong><small>Restaurant Admin invites the person and selects OWNER/MANAGER, WAITER or RIDER with explicit branch scope.</small></span></li>
          <li><b>3</b><span><strong>Install one Operations app</strong><small>After secure sign-in, the server resolves membership, restaurant, branch, role and entitlement. The client cannot grant itself another role.</small></span></li>
        </ol>
        <Link className="button button-primary" href="/users">Manage staff & branch access</Link>
        <p className="apps-access-note">Current restaurant capabilities: Android <b>{context.capabilities["mobile.android"] ? "enabled" : "disabled"}</b> · iOS <b>{context.capabilities["mobile.ios"] ? "enabled" : "disabled"}</b> · Waiter <b>{context.capabilities.waiter ? "enabled" : "disabled"}</b> · Rider <b>{context.capabilities.rider ? "enabled" : "disabled"}</b>.</p>
      </div>

      <div className="apps-access-panel">
        <div className="apps-access-panel__heading"><div><span className="eyebrow">INSTALL</span><h2>Mobile downloads</h2></div><Download aria-hidden="true"/></div>
        <div className="apps-release-list">
          {releases.map((release) => <article key={release.platform} className="apps-release-card">
            <div className="apps-release-card__copy"><div><strong>{release.platform}</strong><span data-status={release.status}>{release.status === "READY" ? release.channel : "Publication pending"}</span></div><p>{release.detail}</p>{release.url ? <a className="button button-secondary" href={release.url} rel="noreferrer" target="_blank">Open {release.channel}</a> : <small>No download button is shown until a verified HTTPS release URL is configured.</small>}</div>
            {release.qr ? <Image src={release.qr} width={132} height={132} unoptimized alt={`QR code for ${release.platform} ${release.channel}`} /> : <div className="apps-release-placeholder" aria-label={`${release.platform} release pending`}><Smartphone aria-hidden="true"/><span>Release pending</span></div>}
          </article>)}
        </div>
      </div>
    </section>
  </main>
}
