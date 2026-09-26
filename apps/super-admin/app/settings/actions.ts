"use server"
import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createPlatformAdminClient } from "@/lib/supabase/admin"
import { normalizeBrandingImage } from "@/lib/branding-image"

export type BrandingState = { error?: string; success?: string; version?: number }
export async function saveBrandingAction(_: BrandingState, form: FormData): Promise<BrandingState> {
  const context = await requirePlatformPermission("team.manage")
  const client = await createClient()
  const role = await client.from("platform_staff_roles").select("platform_roles!inner(key)").eq("staff_user_id", context.userId).eq("platform_roles.key", "PLATFORM_OWNER").limit(1)
  if (role.error || !role.data?.length) return { error: "Only the Platform Owner can change QaziPro branding." }
  const current = await client.from("platform_branding").select("logo_path,icon_path,version").eq("singleton", true).single()
  if (current.error) return { error: "Branding storage is unavailable. The previous logo has not changed." }
  const version = Number(form.get("version"))
  if (!Number.isSafeInteger(version) || version !== current.data.version) return { error: "Branding changed in another session. Reload before saving." }
  const admin = createPlatformAdminClient()
  if (!admin) return { error: "Asset storage is not configured." }
  const uploaded: string[] = []
  let commitAttempted = false
  try {
    const paths = { logo: current.data.logo_path as string | null, icon: current.data.icon_path as string | null }
    if (form.get("reset") === "true") { paths.logo = null; paths.icon = null }
    else {
      for (const key of ["logo", "icon"] as const) {
        const file = form.get(key)
        if (!(file instanceof File) || !file.size) continue
        const buffer = await normalizeBrandingImage(file)
        const path = `platform/${randomUUID()}.png`
        const result = await admin.storage.from("platform-branding").upload(path, buffer, { contentType: "image/png", upsert: false })
        if (result.error) throw new Error("Upload failed. Your previous branding is unchanged.")
        uploaded.push(path); paths[key] = path
      }
    }
    commitAttempted = true
    const result = await client.rpc("platform_save_branding", { p_logo_path: paths.logo, p_icon_path: paths.icon, p_expected_version: version })
    if (result.error) return { error: result.error.code === "PT409" ? "Branding changed in another session. Reload before saving." : "Branding could not be saved. The previous assets are preserved." }
    revalidatePath("/", "layout")
    return { success: "QaziPro branding saved.", version: result.data }
  } catch {
    return { error: "Upload failed. Use a static PNG, JPEG or WebP, 32–4000 pixels per side and under 2 MB. Your previous branding is preserved." }
  } finally {
    // An ambiguous network response may follow a successful commit. Never delete
    // assets after attempting the RPC; a harmless orphan is safer than a broken logo.
    if (!commitAttempted && uploaded.length) await admin.storage.from("platform-branding").remove(uploaded)
  }
}
