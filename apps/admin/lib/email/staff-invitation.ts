import "server-only"

import nodemailer from "nodemailer"
import { isSyntheticQaEmail } from "@italian-pizza/shared"

type StaffInvitationEmail = {
  recipient: string
  restaurantName: string
  branchLabel: string
  branchAddress?: string | null
  role: string
  permissionCount: number
  acceptUrl: string
  logoUrl?: string | null
  primaryColor?: string | null
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)

const publicImageUrl = (value?: string | null) => {
  if (!value?.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null
  } catch {
    return null
  }
}

export async function sendStaffInvitationEmail(invitation: StaffInvitationEmail) {
  if (isSyntheticQaEmail(invitation.recipient)) return { status: "SUPPRESSED" as const, error: "Synthetic QA recipient suppressed." }
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const password = process.env.SMTP_PASSWORD?.trim()
  if (!host || !user || !password) return { status: "FAILED" as const, error: "Email / SMTP is not configured." }

  const port = Number(process.env.SMTP_PORT || 587)
  const accent = /^#[0-9a-f]{6}$/i.test(invitation.primaryColor ?? "") ? invitation.primaryColor! : "#a92114"
  const logoUrl = publicImageUrl(invitation.logoUrl)
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="180" alt="${escapeHtml(invitation.restaurantName)} logo" style="display:block;width:auto;max-width:180px;max-height:76px;margin:0 auto 16px;object-fit:contain" />`
    : ""
  const role = invitation.role.toLowerCase().replace(/(^|\s)\S/g, character => character.toUpperCase())
  const html = `<div style="margin:0;padding:28px 12px;background:#f6f3f1;font-family:Arial,sans-serif;color:#211d1a"><div style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #eadfd8;border-radius:16px;background:#fff"><div style="padding:28px 24px;background:${accent};color:#fff;text-align:center">${logo}<h1 style="margin:0;font-size:27px">${escapeHtml(invitation.restaurantName)}</h1><p style="margin:8px 0 0;opacity:.9">Staff access invitation</p></div><div style="padding:30px"><h2 style="margin:0 0 12px">You’re invited to join the restaurant team</h2><p style="line-height:1.6">An owner has invited you to access <strong>${escapeHtml(invitation.branchLabel)}</strong>.</p><div style="margin:22px 0;padding:16px;border-radius:10px;background:#f8f5f3"><strong>Role:</strong> ${escapeHtml(role)}<br><strong>Access:</strong> ${invitation.permissionCount} selected permission${invitation.permissionCount === 1 ? "" : "s"}${invitation.branchAddress ? `<br><strong>Restaurant:</strong> ${escapeHtml(invitation.branchAddress)}` : ""}</div><p style="margin:28px 0"><a href="${escapeHtml(invitation.acceptUrl)}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:${accent};color:#fff;text-decoration:none;font-weight:700">Accept invitation &amp; sign in</a></p><p style="font-size:13px;line-height:1.6;color:#6c625c">For security, use this link only with the invited email address. If the link expires, ask the restaurant owner to resend it.</p><hr style="border:0;border-top:1px solid #eadfd8"><p style="margin-bottom:0;font-size:12px;color:#7b716c">If you were not expecting this invitation, you can safely ignore this email.</p></div></div></div>`
  const text = `You’re invited to join ${invitation.branchLabel} as ${role}.\n\nAccept invitation and sign in: ${invitation.acceptUrl}\n\nThis access is for ${invitation.restaurantName}. If you were not expecting it, ignore this email.`

  try {
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass: password } })
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM?.trim() || user,
      to: invitation.recipient,
      subject: `Staff invitation — ${invitation.restaurantName}`,
      html,
      text,
    })
    return { status: "SENT" as const, messageId: result.messageId }
  } catch (error) {
    return { status: "FAILED" as const, error: error instanceof Error ? error.message : "Invitation email delivery failed." }
  }
}
