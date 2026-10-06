"use client";
import { useState } from "react";
import { Badge, Button, ErrorNote, Field, inputCls, PageTitle, Panel, SectionTitle } from "@/components/ui";
import { post } from "@/lib/api";
import { type User, useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";

const ROLES: { value: User["role"]; label: string; desc: string }[] = [
  { value: "viewer", label: "Viewer", desc: "Read dashboards, map and incidents" },
  { value: "field_agent", label: "Field agent", desc: "Also record incidents and upload coordinates" },
  { value: "analyst", label: "Analyst", desc: "Also verify incidents, manage subscribers and approve/send alerts" },
  { value: "admin", label: "Administrator", desc: "Also manage users and camera feeds" },
];

export default function SettingsPage() {
  const { user, can } = useAuth();
  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Panel className="p-6">
          <SectionTitle>Your account</SectionTitle>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted">Email</dt><dd>{user?.email}</dd></div>
            <div><dt className="text-muted">Name</dt><dd>{user?.name || "—"}</dd></div>
            <div><dt className="text-muted">Role</dt><dd>{ROLES.find((r) => r.value === user?.role)?.label}</dd></div>
          </dl>
          <h3 className="mb-2 mt-8 font-semibold">Roles</h3>
          <ul className="space-y-2 text-sm">
            {ROLES.map((r) => <li key={r.value}><b className="font-medium">{r.label}:</b> <span className="text-ink-2">{r.desc}</span></li>)}
          </ul>
        </Panel>
        {can("admin") && <Users />}
      </div>
    </>
  );
}

function Users() {
  const { data, reload } = useApi<(User & { active: boolean })[]>("/api/auth/users");
  const [f, setF] = useState({ email: "", name: "", password: "", role: "viewer" as User["role"] });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await post("/api/auth/users", f);
      setF({ email: "", name: "", password: "", role: "viewer" });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <Panel className="p-6">
      <SectionTitle>Team</SectionTitle>
      <table className="mb-8 w-full text-sm">
        <tbody>
          {data?.map((u) => (
            <tr key={u.id} className="border-t border-line">
              <td className="py-3">{u.name || "—"}<span className="block text-xs text-muted">{u.email}</span></td>
              <td><Badge tone={u.role === "admin" ? "red" : u.role === "analyst" ? "blue" : "grey"}>{ROLES.find((r) => r.value === u.role)?.label}</Badge></td>
              <td className="text-right text-xs text-muted">{u.active ? "active" : "disabled"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-3 font-semibold">Add team member</h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><ErrorNote>{err}</ErrorNote></div>}
        <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 10 characters; share it securely.">
          <input className={inputCls} type="password" autoComplete="new-password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        </Field>
        <Field label="Role">
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as User["role"] })}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Button type="submit">Add member</Button></div>
      </form>
    </Panel>
  );
}
