"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Badge, Button, Drawer, Empty, ErrorNote, Field, inputCls, PageTitle, Panel, Tabs } from "@/components/ui";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDateTime, label } from "@/lib/format";

type Alert = {
  id: number; status: "draft" | "approved" | "sent" | "rejected"; trigger: string; severity: string; title: string;
  area_name: string; center_lat: number; center_lon: number; radius_km: number; messages: Record<string, string>;
  context: Record<string, unknown>; created_at: string; approved_at: string | null; sent_at: string | null;
  recipients_estimate: number | null; deliveries: Record<string, number>;
};
type Filter = "draft" | "approved" | "sent" | "rejected" | "all";
const LANG: Record<string, string> = { en: "English", ha: "Hausa", tiv: "Tiv" };

export default function AlertsPage() {
  return <Suspense><Alerts /></Suspense>;
}

function Alerts() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useAuth();
  const { version } = useLive();
  const [filter, setFilter] = useState<Filter>("draft");
  const [msg, setMsg] = useState<string | null>(null);
  const { data, error, reload } = useApi<Alert[]>(`/api/alerts?${filter === "all" ? "" : `status=${filter}&`}v=${version}`);

  async function runRules() {
    const r = await post<{ created: number[] }>("/api/alerts/run-rules");
    setMsg(r.created.length ? `${r.created.length} new draft alert(s) created.` : "No new conditions met the alert rules.");
    reload();
  }

  return (
    <>
      <PageTitle title="Alerts">
        {can("analyst") && <Button variant="ghost" onClick={runRules}>Check rules now</Button>}
        {can("analyst") && <Button onClick={() => router.replace("/alerts?new=1")}>Draft alert</Button>}
      </PageTitle>

      <div className="mb-6 flex items-start gap-2 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        <ShieldCheck size={18} className="mt-px shrink-0 text-[var(--teal)]" />
        Rules only create drafts. An analyst must review the wording and the target area, approve, and then send. False
        alarms cause panic and can provoke reprisals, so check corroborating reports first.
      </div>

      <Panel>
        <div className="border-b border-line px-6 pt-5">
          <Tabs value={filter} onChange={setFilter} tabs={[
            { value: "draft", label: "Awaiting review" }, { value: "approved", label: "Approved" },
            { value: "sent", label: "Sent" }, { value: "rejected", label: "Rejected" }, { value: "all", label: "All" },
          ]} />
        </div>
        <div className="space-y-6 p-6">
          {msg && <div className="rounded-sm bg-primary-soft px-4 py-2 text-sm text-[#2a3a8f]">{msg}</div>}
          {error && <ErrorNote>{error}</ErrorNote>}
          {data?.map((a) => <AlertCard key={a.id} a={a} onChanged={reload} />)}
          {data && !data.length && <Empty>No alerts here.</Empty>}
        </div>
      </Panel>

      <Drawer open={params.get("new") === "1"} onClose={() => router.replace("/alerts")} title="Draft alert">
        <NewAlert onCreated={() => { setFilter("draft"); reload(); router.replace("/alerts"); }} />
      </Drawer>
    </>
  );
}

function AlertCard({ a, onChanged }: { a: Alert; onChanged: () => void }) {
  const { can } = useAuth();
  const [messages, setMessages] = useState(a.messages);
  const [radius, setRadius] = useState(a.radius_km);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = a.status === "draft" && can("analyst");
  const dirty = JSON.stringify(messages) !== JSON.stringify(a.messages) || radius !== a.radius_km;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = () => api(`/api/alerts/${a.id}`, { method: "PATCH", body: JSON.stringify({ messages, radius_km: radius }) });

  return (
    <article className="grid gap-6 rounded-sm border border-line p-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={a.severity === "high" ? "red" : "amber"}>{a.severity}</Badge>
          <Badge tone="grey">{label(a.trigger)}</Badge>
          <Badge tone={a.status === "sent" ? "green" : a.status === "rejected" ? "grey" : "blue"}>{label(a.status)}</Badge>
          <span className="text-sm text-muted">created {fmtDateTime(a.created_at)}</span>
        </div>
        <h3 className="text-lg font-semibold">{a.title}</h3>
        <ContextLine a={a} />
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="space-y-3">
          {Object.entries(messages).map(([lang, text]) => (
            <Field key={lang} label={`${LANG[lang] ?? lang}${lang === "tiv" && text === messages.en ? " (no Tiv translation yet: English will be sent)" : ""}`}>
              <textarea className={inputCls} rows={3} value={text} readOnly={!editable}
                onChange={(e) => setMessages({ ...messages, [lang]: e.target.value })} />
              <span className="text-xs text-muted">{text.length} characters · {Math.ceil(text.length / 153)} SMS part(s)</span>
            </Field>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && dirty && <Button variant="ghost" disabled={busy} onClick={() => act(save)}>Save changes</Button>}
          {editable && (
            <>
              <Button disabled={busy || dirty} onClick={() => act(() => post(`/api/alerts/${a.id}/approve`))}
                title={dirty ? "Save changes first" : undefined}>Approve</Button>
              <Button variant="danger" disabled={busy} onClick={() => act(() => post(`/api/alerts/${a.id}/reject`))}>Reject</Button>
            </>
          )}
          {a.status === "approved" && can("analyst") && (
            <Button disabled={busy} onClick={() => confirm(`Send this alert by SMS to about ${a.recipients_estimate} subscribers?`) && act(() => post(`/api/alerts/${a.id}/send`))}>
              Send SMS to {a.recipients_estimate} subscribers
            </Button>
          )}
          {a.status === "sent" && (
            <span className="text-sm text-ink-2">
              Sent {a.sent_at && fmtDateTime(a.sent_at)} · {a.deliveries.sent ?? 0} delivered
              {a.deliveries.failed ? `, ${a.deliveries.failed} failed` : ""}
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="overflow-hidden rounded-sm border border-line">
          <MapView height={240} layers={{ circle: { lat: a.center_lat, lon: a.center_lon, radiusKm: radius } }} />
        </div>
        <div className="mt-3 text-sm text-ink-2">
          {a.area_name}
          {editable ? (
            <label className="mt-2 flex items-center gap-3">
              Radius
              <input type="range" min={3} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
                className="flex-1 accent-[var(--primary)]" />
              <span className="w-14 text-right tabular-nums">{radius} km</span>
            </label>
          ) : <span className="text-muted"> · {a.radius_km} km radius</span>}
          {a.recipients_estimate != null && <div className="mt-1 text-muted">~{a.recipients_estimate} subscribers in area</div>}
        </div>
      </div>
    </article>
  );
}

function ContextLine({ a }: { a: Alert }) {
  const c = a.context;
  if (a.trigger === "risk")
    return <p className="text-sm text-ink-2">{String(c.cells)} high-risk area(s); peak 2-week probability {(Number(c.max_probability) * 100).toFixed(1)} % (model {String(c.model_version)}).</p>;
  if (a.trigger === "incident")
    return <p className="text-sm text-ink-2">Triggered by verified <a className="text-primary hover:underline" href={`/incidents?id=${c.incident_id}`}>incident #{String(c.incident_id)}</a> ({String(c.fatalities)} killed).</p>;
  if (a.trigger === "fire")
    return <p className="text-sm text-ink-2">Satellite fire ({String(c.frp)} MW) within 10 km of {String(c.nearby_incidents)} recent incident(s).</p>;
  return null;
}

function NewAlert({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ title: "", area_name: "", severity: "medium", radius_km: 15, lat: 8.3, lon: 8.6 });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post("/api/alerts", { title: f.title, area_name: f.area_name, severity: f.severity, radius_km: f.radius_km,
        center_lat: f.lat, center_lon: f.lon, trigger: "manual" });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <Field label="Title"><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></Field>
      <Field label="Area name (appears in the SMS)"><input className={inputCls} value={f.area_name} onChange={(e) => setF({ ...f, area_name: e.target.value })} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Severity">
          <select className={inputCls} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
            <option value="medium">Medium</option><option value="high">High</option>
          </select>
        </Field>
        <Field label="Radius (km)"><input className={inputCls} type="number" min={1} max={100} value={f.radius_km} onChange={(e) => setF({ ...f, radius_km: Number(e.target.value) })} /></Field>
      </div>
      <p className="text-sm text-muted">Click the map to set the centre ({f.lat.toFixed(3)}, {f.lon.toFixed(3)}).</p>
      <div className="overflow-hidden rounded-sm border border-line">
        <MapView height={260} layers={{ circle: { lat: f.lat, lon: f.lon, radiusKm: f.radius_km } }}
          onMapClick={(lat, lon) => setF((s) => ({ ...s, lat, lon }))} />
      </div>
      <p className="text-xs text-muted">The message text is generated from the standard template; you can edit it before approving.</p>
      <Button type="submit" className="w-full">Create draft</Button>
    </form>
  );
}
