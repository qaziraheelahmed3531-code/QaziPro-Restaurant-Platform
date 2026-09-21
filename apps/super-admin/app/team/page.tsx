import { ShieldCheck, UserPlus } from "lucide-react"
import { invitePlatformStaffAction, revokePlatformStaffAction, setStaffPermissionAction } from "@/app/actions"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, EmptyState, PageHeader, StatusBadge } from "@/components/ui"
import { requirePlatformStaff } from "@/lib/auth"
import { getPlatformTeam } from "@/lib/data"

type Row = Record<string, unknown>

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invited?: string; revoked?: string; permission?: string; error?: string }> }) {
  const context = await requirePlatformStaff()
  const result = await getPlatformTeam()
  const notice = await searchParams
  const isOwner = context.roleNames.includes("Platform Owner")
  return <PlatformShell context={context}>
    <PageHeader eyebrow="PLATFORM SECURITY" title="QaziPro team" description="Separate staff identities, granular grants, immediate revocation and audited access."/>
    {result.error ? <DataNotice message={result.error}/> : null}
    {notice.invited || notice.revoked || notice.permission ? <div className="success-banner">Team access updated and audited.</div> : null}
    {notice.error ? <div className="form-error">Team action was rejected safely ({notice.error}).</div> : null}
    <div className="workspace-grid">
      <section className="panel"><header><div><p className="eyebrow">AUTHORIZED STAFF</p><h2>Access registry</h2></div><ShieldCheck/></header>
        {result.data.staff.length ? <div className="record-list">{result.data.staff.map((staff) => {
          const assignments = (staff.platform_staff_roles ?? []) as Row[]
          const roles = assignments.flatMap((item) => { const role = item.platform_roles as Row | Row[] | null; return Array.isArray(role) ? role.map((entry) => entry.name) : role?.name ? [role.name] : [] })
          const direct = (staff.platform_staff_permissions ?? []) as Row[]
          return <div className="record-row record-row-stack" key={String(staff.user_id)}><div><strong>{String(staff.display_name)}</strong><small>{String(staff.email)} · {roles.map(String).join(", ") || "No role"}{direct.length ? ` · ${direct.length} custom rule(s)` : ""}</small></div><StatusBadge value={staff.status}/>{staff.user_id !== context.userId && staff.status !== "REVOKED" ? <form action={revokePlatformStaffAction} className="inline-action"><input type="hidden" name="userId" value={String(staff.user_id)}/><input type="hidden" name="reason" value="Platform access revoked by team administrator"/><button className="text-button danger">Revoke</button></form> : null}</div>
        })}</div> : <EmptyState title="No platform staff" detail="Bootstrap the allowlisted Platform Owner before inviting the operations team."/>}
      </section>
      <section className="panel"><header><div><p className="eyebrow">INVITE</p><h2>Add QaziPro staff</h2></div><UserPlus/></header>
        <form action={invitePlatformStaffAction} className="form-grid compact-form"><label>Full name<input name="displayName" required minLength={2}/></label><label>Work email<input name="email" type="email" required/></label><label className="span-2">Role<select name="roleKey" required defaultValue=""><option value="" disabled>Select least-privilege role</option>{result.data.roles.map((role) => <option key={String(role.key)} value={String(role.key)}>{String(role.name)}</option>)}</select></label><label className="check-row span-2"><input type="checkbox" name="mfaRequired" defaultChecked/>Require MFA when enforcement is enabled</label><label className="span-2">Reason<input name="reason" required defaultValue="QaziPro staff onboarding"/></label><button className="button span-2">Send secure invitation</button></form>
      </section>
    </div>
    {isOwner ? <section className="panel"><header><div><p className="eyebrow">OWNER CONTROL</p><h2>Custom permission override</h2></div><ShieldCheck/></header><p className="muted">A direct deny overrides any role grant. Inherit removes the custom rule. Owner accounts cannot be edited here.</p><form action={setStaffPermissionAction} className="form-grid compact-form"><label>Staff member<select name="userId" required><option value="">Select staff</option>{result.data.staff.filter((staff) => staff.user_id !== context.userId && staff.status !== "REVOKED").map((staff) => <option value={String(staff.user_id)} key={String(staff.user_id)}>{String(staff.display_name)} ({String(staff.email)})</option>)}</select></label><label>Permission<select name="permission" required><option value="">Select capability</option>{result.data.permissions.map((permission) => <option value={String(permission.key)} key={String(permission.key)}>{String(permission.key)}</option>)}</select></label><label>Override<select name="mode"><option>ALLOW</option><option>DENY</option><option>INHERIT</option></select></label><label>Audit reason<input name="reason" required placeholder="Approved access change"/></label><button className="button span-2"><ShieldCheck/>Apply permission rule</button></form></section> : null}
  </PlatformShell>
}
