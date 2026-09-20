"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, MonitorDown, UserRoundX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { permissionCatalog } from "@/lib/permissions";
import type { AdminContext } from "@/lib/auth";
type Staff = {
  id?: string;
  email: string;
  name?: string;
  role: string;
  is_active: boolean;
  permissions: string[];
  branch_id?: string;
  branch_name?: string;
  last_sign_in_at?: string;
  delivery_status?: string;
};
type Branch = {
  id: string;
  name: string;
  restaurant_name?: string | null;
  city: string;
};
type WaiterPerformance = {
  user_id: string;
  waiter_name: string;
  email: string;
  branch_id: string;
  branch_name: string;
  order_count: number;
  active_orders: number;
  completed_orders: number;
  total_sales: number;
  last_order_at: string | null;
};
type RiderPerformance = {
  user_id: string;
  rider_name: string;
  email: string;
  branch_id: string;
  branch_name: string;
  deliveries: number;
  active_deliveries: number;
  completed_deliveries: number;
  cash_collected: number;
  last_delivery_at: string | null;
};
const desktopPosRequired = [
  "desktop_pos.use",
  "pos.use",
  "orders.read",
  "orders.manage",
  "receipts.print",
] as const;

export function StaffManager({
  context,
  presets,
  branches,
}: {
  context: AdminContext;
  presets: Record<string, string[]>;
  branches: Branch[];
}) {
  const [members, setMembers] = useState<Staff[]>([]);
  const [waiters, setWaiters] = useState<WaiterPerformance[]>([]);
  const [riders, setRiders] = useState<RiderPerformance[]>([]);
  const [draft, setDraft] = useState<Staff | null>(null);
  const [desktopProfile, setDesktopProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const allowed = permissionCatalog.filter(
    (p) => context.role === "OWNER" || context.permissions.includes(p.code),
  );
  const groups = [...new Set(allowed.map((p) => p.group))];
  const load = useCallback(async () => {
    const client = createClient();
    const [directory, performance, riderPerformance] = await Promise.all([
      client.rpc("staff_directory", { p_business_id: context.businessId }),
      client.rpc("waiter_performance", { p_business_id: context.businessId }),
      client.rpc("rider_performance", { p_business_id: context.businessId }),
    ]);
    if (directory.error || performance.error || riderPerformance.error)
      setMessage(
        "Could not load staff. Check access and database migrations, then retry.",
      );
    else {
      setMembers([...directory.data.members, ...directory.data.invitations]);
      setWaiters((performance.data ?? []) as WaiterPerformance[]);
      setRiders((riderPerformance.data ?? []) as RiderPerformance[]);
    }
  }, [context.businessId]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  function toggle(codes: string[]) {
    if (!draft) return;
    const mutable = desktopProfile
      ? codes.filter(
          (code) =>
            !desktopPosRequired.includes(
              code as (typeof desktopPosRequired)[number],
            ),
        )
      : codes;
    const all =
      mutable.length > 0 &&
      mutable.every((code) => draft.permissions.includes(code));
    const permissions = all
      ? draft.permissions.filter((code) => !mutable.includes(code))
      : [...new Set([...draft.permissions, ...mutable])];
    setDraft({
      ...draft,
      permissions: desktopProfile
        ? [...new Set([...permissions, ...desktopPosRequired])]
        : permissions,
    });
  }
  async function save(person: Staff) {
    setBusy(true);
    setMessage("");
    try {
      const normalized = desktopProfile
        ? {
            ...person,
            role: "CASHIER",
            permissions: [
              ...new Set([...person.permissions, ...desktopPosRequired]),
            ],
          }
        : person;
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized.email,
          branchId:
            normalized.branch_id ?? context.activeBranchId ?? branches[0]?.id,
          role: normalized.role,
          active: normalized.is_active,
          permissions: normalized.permissions,
          sendInvite: !normalized.id || Boolean(normalized.delivery_status),
        }),
      });
      const result = await response.json();
      setMessage(result.error ?? result.message);
      if (response.ok) {
        setDraft(null);
        setDesktopProfile(false);
        await load();
      }
    } catch {
      setMessage(
        "Could not reach the server. Refresh before retrying; saving was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeAccess(person: Staff) {
    if (!person.id || person.role === "OWNER") return;
    const pending = Boolean(person.delivery_status);
    const prompt = pending
      ? `Cancel the invitation for ${person.email}? They will not be able to activate this restaurant access.`
      : `Remove ${person.email} from ${person.branch_name ?? context.businessName}? Their login account will remain, but this restaurant and all its staff permissions will be revoked immediately.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: person.id }),
      });
      const result = await response.json();
      setMessage(
        result.error ??
          result.message ??
          (response.ok
            ? "Staff access removed."
            : "Staff access could not be removed."),
      );
      if (response.ok) await load();
    } catch {
      setMessage(
        "Could not reach the server. Access removal was not confirmed; refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (!busy && window.confirm("Discard unsaved staff changes?")) {
      setDraft(null);
      setDesktopProfile(false);
    }
  }
  function preset(role: string) {
    return (
      role === "OWNER" ? allowed.map((p) => p.code) : (presets[role] ?? [])
    ).filter((code) => allowed.some((p) => p.code === code));
  }
  const canGrantDesktop = desktopPosRequired.every((code) =>
    allowed.some((permission) => permission.code === code),
  );
  const posMembers = members.filter(
    (person) =>
      person.permissions.includes("desktop_pos.use") || person.role === "OWNER",
  );
  const openGeneral = () => {
    setDesktopProfile(false);
    setDraft({
      email: "",
      branch_id: context.activeBranchId ?? branches[0]?.id,
      role: "STAFF",
      is_active: true,
      permissions: preset("STAFF"),
    });
  };
  const openDesktop = () => {
    setDesktopProfile(true);
    setDraft({
      email: "",
      branch_id: context.activeBranchId ?? branches[0]?.id,
      role: "CASHIER",
      is_active: true,
      permissions: [...desktopPosRequired],
    });
  };
  const editPerson = (person: Staff) => {
    const isDesktop =
      person.role === "CASHIER" &&
      person.permissions.includes("desktop_pos.use");
    setDesktopProfile(isDesktop);
    setDraft({
      ...person,
      branch_id: person.branch_id ?? context.activeBranchId ?? branches[0]?.id,
      permissions: [
        ...new Set([
          ...person.permissions.filter((code) =>
            allowed.some((p) => p.code === code),
          ),
          ...(isDesktop ? desktopPosRequired : []),
        ]),
      ],
    });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Staff & roles</h1>
          <p>
            Invite employees to {context.businessName}. Their secure email link
            activates only the selected restaurant, role and permissions.
          </p>
        </div>
        <button
          className="button"
          disabled={!branches.length}
          onClick={openGeneral}
        >
          Add staff
        </button>
      </div>
      <section className="desktop-pos-access panel">
        <div className="desktop-pos-access__intro">
          <span>
            <MonitorDown />
          </span>
          <div>
            <small>DEDICATED COUNTER ACCESS</small>
            <h2>QaziPRO POS Desktop</h2>
            <p>
              POS sales, website orders, status control and receipt printing
              stay fixed. Add Dashboard, Kitchen, Reports or other areas only
              when that cashier needs them.
            </p>
          </div>
          <button
            className="button"
            disabled={!branches.length || !canGrantDesktop}
            onClick={openDesktop}
          >
            Give Desktop POS access
          </button>
        </div>
        <div className="desktop-pos-access__fixed">
          {desktopPosRequired.map((code) => (
            <span key={code}>
              <CheckCircle2 />
              {permissionCatalog.find((permission) => permission.code === code)
                ?.label ?? code}
              <b>Fixed</b>
            </span>
          ))}
        </div>
        <div className="desktop-pos-access__people">
          <strong>
            {posMembers.length} POS user{posMembers.length === 1 ? "" : "s"}
          </strong>
          <span>
            {posMembers
              .slice(0, 4)
              .map((person) => person.email)
              .join(" · ") || "No Desktop POS user invited yet."}
          </span>
        </div>
      </section>
      <div className="resource-toolbar">
        <label className="search-field">
          <input
            aria-label="Search staff"
            placeholder="Search email or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="button button--outline" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name / email</th>
              <th>Restaurant</th>
              <th>Role</th>
              <th>Access</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members
              .filter((p) =>
                `${p.email} ${p.name ?? ""} ${p.branch_name ?? ""}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .map((person) => (
                <tr key={person.id}>
                  <td>
                    {person.name && (
                      <strong>
                        {person.name}
                        <br />
                      </strong>
                    )}
                    {person.email}
                  </td>
                  <td>{person.branch_name ?? "Not assigned"}</td>
                  <td>
                    {person.role === "CASHIER" &&
                    person.permissions.includes("desktop_pos.use")
                      ? "DESKTOP POS / CASHIER"
                      : person.role}
                  </td>
                  <td>
                    {person.role === "OWNER"
                      ? "All access"
                      : `${person.permissions.length} permissions`}
                  </td>
                  <td>
                    {person.delivery_status
                      ? `Pending · ${person.delivery_status.replaceAll("_", " ").toLowerCase()}`
                      : person.is_active
                        ? "Active"
                        : "Inactive"}
                  </td>
                  <td>
                    {person.last_sign_in_at
                      ? new Date(person.last_sign_in_at).toLocaleDateString(
                          "en-PK",
                        )
                      : "Not yet"}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        disabled={
                          busy ||
                          (person.role === "OWNER" && context.role !== "OWNER")
                        }
                        onClick={() => editPerson(person)}
                      >
                        Edit access
                      </button>
                      {person.delivery_status && person.is_active && (
                        <button
                          disabled={busy}
                          onClick={() => void save(person)}
                        >
                          Resend invite
                        </button>
                      )}
                      {person.role !== "OWNER" && (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={busy}
                          onClick={() => void removeAccess(person)}
                        >
                          <UserRoundX />
                          Remove access
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p role="status">{message}</p>
      <section className="panel section-gap">
        <div className="panel-header">
          <div>
            <h2>Waiter performance</h2>
            <p>
              Orders sent from each waiter tablet, with live operational totals.
            </p>
          </div>
        </div>
        {waiters.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Waiter</th>
                  <th>Restaurant</th>
                  <th>Orders</th>
                  <th>Active</th>
                  <th>Completed</th>
                  <th>Order value</th>
                  <th>Last order</th>
                </tr>
              </thead>
              <tbody>
                {waiters.map((waiter) => (
                  <tr key={waiter.user_id}>
                    <td data-label="Waiter">
                      <strong>{waiter.waiter_name}</strong>
                      <small>{waiter.email}</small>
                    </td>
                    <td data-label="Restaurant">{waiter.branch_name}</td>
                    <td data-label="Orders">{waiter.order_count}</td>
                    <td data-label="Active">{waiter.active_orders}</td>
                    <td data-label="Completed">{waiter.completed_orders}</td>
                    <td data-label="Order value">
                      Rs {Number(waiter.total_sales).toLocaleString("en-PK")}
                    </td>
                    <td data-label="Last order">
                      {waiter.last_order_at
                        ? new Date(waiter.last_order_at).toLocaleString(
                            "en-PK",
                            { timeZone: "Asia/Karachi" },
                          )
                        : "Not yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            Assign the WAITER / TABLET role to see waiter order performance
            here.
          </div>
        )}
      </section>
      <section className="panel section-gap">
        <div className="panel-header">
          <div>
            <h2>Rider performance</h2>
            <p>
              Assigned deliveries, completed drop-offs and cash collected by
              each rider.
            </p>
          </div>
        </div>
        {riders.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Restaurant</th>
                  <th>Deliveries</th>
                  <th>Active</th>
                  <th>Completed</th>
                  <th>Cash collected</th>
                  <th>Last delivery</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((rider) => (
                  <tr key={rider.user_id}>
                    <td data-label="Rider">
                      <strong>{rider.rider_name}</strong>
                      <small>{rider.email}</small>
                    </td>
                    <td data-label="Restaurant">{rider.branch_name}</td>
                    <td data-label="Deliveries">{rider.deliveries}</td>
                    <td data-label="Active">{rider.active_deliveries}</td>
                    <td data-label="Completed">{rider.completed_deliveries}</td>
                    <td data-label="Cash collected">
                      Rs {Number(rider.cash_collected).toLocaleString("en-PK")}
                    </td>
                    <td data-label="Last delivery">
                      {rider.last_delivery_at
                        ? new Date(rider.last_delivery_at).toLocaleString(
                            "en-PK",
                            { timeZone: "Asia/Karachi" },
                          )
                        : "Not yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            Enable Rider Portal and assign the RIDER role to see delivery
            performance here.
          </div>
        )}
      </section>
      {draft && (
        <div className="drawer-backdrop">
          <section
            className="editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-title"
          >
            <header>
              <h2 id="staff-title">
                {desktopProfile
                  ? draft.id
                    ? "Edit Desktop POS access"
                    : "Give Desktop POS access"
                  : draft.id
                    ? "Edit staff access"
                    : "Add staff"}
              </h2>
              <button
                className="icon-action"
                disabled={busy}
                aria-label="Close staff editor"
                onClick={close}
              >
                <X />
              </button>
            </header>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save(draft);
              }}
            >
              <div className="editor-form">
                <label className="is-wide">
                  Employee email
                  <input
                    type="email"
                    required
                    readOnly={Boolean(draft.id)}
                    value={draft.email}
                    onChange={(e) =>
                      setDraft({ ...draft, email: e.target.value })
                    }
                  />
                </label>
                <label className="is-wide">
                  Restaurant
                  <select
                    required
                    value={draft.branch_id ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, branch_id: e.target.value })
                    }
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.restaurant_name || branch.name} — {branch.city}
                      </option>
                    ))}
                  </select>
                  <small>
                    The employee will enter and operate only this restaurant
                    branch.
                  </small>
                </label>
                <label>
                  Role preset
                  <select
                    disabled={desktopProfile}
                    value={draft.role}
                    onChange={(e) => {
                      const role = e.target.value;
                      setDesktopProfile(role === "CASHIER");
                      setDraft({
                        ...draft,
                        role,
                        permissions:
                          role === "CASHIER"
                            ? [
                                ...new Set([
                                  ...preset(role),
                                  ...desktopPosRequired,
                                ]),
                              ]
                            : preset(role),
                      });
                    }}
                  >
                    {[
                      "OWNER",
                      "MANAGER",
                      "CASHIER",
                      "KITCHEN",
                      "WAITER",
                      "RIDER",
                      "STAFF",
                    ]
                      .filter(
                        (role) => context.role === "OWNER" || role !== "OWNER",
                      )
                      .map((role) => (
                        <option key={role} value={role}>
                          {role === "CASHIER"
                            ? "DESKTOP POS / CASHIER"
                            : role === "WAITER"
                              ? "WAITER / TABLET"
                              : role === "RIDER"
                                ? "RIDER / DELIVERY"
                                : role}
                        </option>
                      ))}
                  </select>
                  {desktopProfile && (
                    <small>
                      Desktop POS uses the CASHIER identity. Its four core
                      permissions cannot be removed.
                    </small>
                  )}
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(e) =>
                      setDraft({ ...draft, is_active: e.target.checked })
                    }
                  />
                  Active
                </label>
                <div className="is-wide permission-groups">
                  <p>
                    Role loads a preset. The employee receives a secure sign-in
                    link for {context.businessName} and can access only the
                    selected areas. Owners retain all access.
                  </p>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      disabled={draft.role === "OWNER"}
                      checked={
                        draft.role === "OWNER" ||
                        allowed.every((p) => draft.permissions.includes(p.code))
                      }
                      onChange={() => toggle(allowed.map((p) => p.code))}
                    />
                    Select all available permissions
                  </label>
                  {groups.map((group) => {
                    const permissions = allowed.filter(
                      (p) => p.group === group,
                    );
                    return (
                      <fieldset key={group}>
                        <legend>{group}</legend>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            disabled={draft.role === "OWNER"}
                            checked={
                              draft.role === "OWNER" ||
                              permissions.every((p) =>
                                draft.permissions.includes(p.code),
                              )
                            }
                            onChange={() =>
                              toggle(permissions.map((p) => p.code))
                            }
                          />
                          Select all optional access in {group.toLowerCase()}
                        </label>
                        {permissions.map((p) => {
                          const fixed =
                            desktopProfile &&
                            desktopPosRequired.includes(
                              p.code as (typeof desktopPosRequired)[number],
                            );
                          return (
                            <label key={p.code} className="checkbox-field">
                              <input
                                type="checkbox"
                                checked={
                                  draft.role === "OWNER" ||
                                  draft.permissions.includes(p.code)
                                }
                                disabled={draft.role === "OWNER" || fixed}
                                onChange={() => toggle([p.code])}
                              />
                              {p.label}
                              {fixed && (
                                <small className="fixed-permission">
                                  Fixed for Desktop POS
                                </small>
                              )}
                            </label>
                          );
                        })}
                      </fieldset>
                    );
                  })}
                </div>
              </div>
              <footer className="editor-footer">
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy}
                  onClick={close}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
