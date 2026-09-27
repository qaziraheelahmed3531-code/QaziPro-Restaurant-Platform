import "server-only"

import nodemailer from "nodemailer"
import { isSyntheticQaEmail } from "@italian-pizza/shared"

type Campaign = {
  subject: string
  message: string
  restaurant: string
  customerOrigin: string
  logoUrl?: string | null
  primaryColor?: string | null
  deal?: { name: string; description?: string | null; price?: number | null; imageUrl?: string | null } | null
}
type Recipient = { deliveryId: number; recipient: string }
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
const publicUrl = (origin: string, value?: string | null) => {
  if (!value?.trim()) return null
  try { const url = new URL(value, origin); return url.protocol === "https:" && !url.username && !url.password ? url.href : null } catch { return null }
}

export async function sendCustomerBroadcast(campaign: Campaign, recipients: Recipient[]) {
  const suppressed = (recipient: string) => isSyntheticQaEmail(recipient) || /@example\.(test|invalid)$/i.test(recipient) || /qa[-_.+]|do.?not.?fulfill/i.test(recipient)
  const skipped = (item: Recipient) => ({ ...item, status: "SKIPPED" as const, error: "Automated/test recipient suppressed." })
  // Do not even create a transport for an entirely synthetic test batch.
  if (recipients.every(item => suppressed(item.recipient))) return recipients.map(skipped)
  let origin: URL
  try {
    origin = new URL(campaign.customerOrigin)
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.origin !== campaign.customerOrigin) throw new Error("Invalid origin")
  } catch {
    return recipients.map(item => suppressed(item.recipient) ? skipped(item) : { ...item, status: "FAILED" as const, error: "A verified restaurant website address is required." })
  }
  const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), password = process.env.SMTP_PASSWORD?.trim()
  if (!host || !user || !password) return recipients.map((item) => suppressed(item.recipient) ? skipped(item) : ({ ...item, status: "FAILED" as const, error: "Email provider is not configured." }))
  const port = Number(process.env.SMTP_PORT || 587)
  if (!Number.isInteger(port) || port < 1 || port > 65535) return recipients.map((item) => suppressed(item.recipient) ? skipped(item) : ({ ...item, status: "FAILED" as const, error: "Email provider is not configured." }))
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass: password } })
  const accent = /^#[0-9a-f]{6}$/i.test(campaign.primaryColor ?? "") ? campaign.primaryColor! : "#981f16"
  const logo = publicUrl(origin.origin, campaign.logoUrl)
  const dealImage = publicUrl(origin.origin, campaign.deal?.imageUrl)
  const customerUrl = new URL(campaign.deal ? "/#deals" : "/", origin).href
  const preferencesUrl = new URL("/account#communications", origin).href
  const dealBlock = campaign.deal ? `<div style="margin:22px 0;padding:18px;border:1px solid #eadfd8;border-radius:14px">${dealImage ? `<img src="${escapeHtml(dealImage)}" alt="" width="520" style="display:block;width:100%;max-height:250px;object-fit:cover;border-radius:10px;margin-bottom:15px"/>` : ""}<h2 style="margin:0 0 6px">${escapeHtml(campaign.deal.name)}</h2>${campaign.deal.description ? `<p style="margin:0 0 8px;color:#6c625c">${escapeHtml(campaign.deal.description)}</p>` : ""}${campaign.deal.price != null ? `<strong style="font-size:20px;color:${accent}">Rs ${Number(campaign.deal.price).toLocaleString("en-PK")}</strong>` : ""}</div>` : ""
  const html = `<div style="max-width:620px;margin:auto;font-family:Arial,sans-serif;color:#211d1a"><div style="padding:24px;background:${accent};color:white;text-align:center">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(campaign.restaurant)} logo" width="180" style="display:block;width:auto;max-width:180px;max-height:76px;margin:0 auto 12px;object-fit:contain"/>` : ""}<strong style="font-size:22px">${escapeHtml(campaign.restaurant)}</strong></div><div style="padding:28px;border:1px solid #eadfd8"><h1 style="font-size:26px">${escapeHtml(campaign.subject)}</h1><p style="font-size:16px;line-height:1.65;white-space:pre-line">${escapeHtml(campaign.message)}</p>${dealBlock}<p style="margin:28px 0"><a href="${escapeHtml(customerUrl)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:${accent};color:white;text-decoration:none;font-weight:bold">Order now</a></p><p style="color:#7a706a;font-size:12px">You opted into offer emails from ${escapeHtml(campaign.restaurant)}. <a href="${escapeHtml(preferencesUrl)}">Manage email preferences or unsubscribe</a> in your restaurant account.</p></div></div>`
  const text = `${campaign.subject}\n\n${campaign.message}${campaign.deal ? `\n\n${campaign.deal.name}${campaign.deal.price != null ? ` — Rs ${campaign.deal.price}` : ""}` : ""}\n\nOrder: ${customerUrl}\n\nManage email preferences or unsubscribe: ${preferencesUrl}`

  return Promise.all(recipients.map(async (item) => {
    if (suppressed(item.recipient)) return skipped(item)
    try {
      const result = await transport.sendMail({ from: process.env.SMTP_FROM || user, to: item.recipient, subject: `${campaign.subject} — ${campaign.restaurant}`, html, text })
      return { ...item, status: "SENT" as const, messageId: result.messageId }
    } catch { return { ...item, status: "FAILED" as const, error: "Email provider did not confirm delivery. Check provider logs before retrying." } }
  })).finally(() => transport.close())
}
