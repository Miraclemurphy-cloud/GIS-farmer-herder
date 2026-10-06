"use client";
import { useState } from "react";
import { Lock } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Badge, Button, Drawer, Empty, ErrorNote, Field, inputCls, PageTitle, Panel, StackedStat } from "@/components/ui";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtInt } from "@/lib/format";

type Sub = {
  id: number; phone: string; name: string; language: string; community: string; state: string | null;
  lga: string | null; lat: number | null; lon: number | null; opted_in: boolean; created_at: string;
};
const LANG: Record<string, string> = { en: "English", ha: "Hausa", tiv: "Tiv" };

export default function CommunitiesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { data, error, reload } = useApi<{ total: number; by_language: Record<string, number>; items: Sub[] }>(
    can("analyst") ? `/api/subscribers?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}` : null);

  if (!can("analyst"))
    return (<><PageTitle title="Communities" /><Panel className="p-6"><Empty>Subscriber records are restricted to analysts and administrators.</Empty></Panel></>);

  const active = (data?.items ?? []).filter((s) => s.opted_in);
  const points: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: active.filter((s) => s.lat != null).map((s) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [s.lon!, s.lat!] }, properties: { id: s.id },
    })),
  };

  async function erase(s: Sub) {
    if (!confirm(`Erase ${s.name || "this subscriber"}'s contact details? They will stop receiving alerts.`)) return;
    await api(`/api/subscribers/${s.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <>
      <PageTitle title="Communities"><Button onClick={() => setAdding(true)}>Add subscriber</Button></PageTitle>
      <div className="mb-6 flex items-start gap-2 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        <Lock size={16} className="mt-0.5 shrink-0" />
        Phone numbers are encrypted at rest and shown masked. Subscribers can text STOP at any time; erasing a record removes the
        contact details (NDPA 2023 data minimisation).
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-6">
          <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <StackedStat value={fmtInt(active.length)} caption="active subscribers" />
            {Object.entries(LANG).map(([k, v]) => <StackedStat key={k} value={fmtInt(data?.by_language[k] ?? 0)} caption={`receive ${v}`} />)}
          </div>
          <input className={`${inputCls} mb-4 max-w-xs`} placeholder="Search name or community" value={q} onChange={(e) => setQ(e.target.value)} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted"><tr>
                <th className="pb-3 font-normal">Name</th><th className="font-normal">Phone</th><th className="font-normal">Community</th>
                <th className="font-normal">LGA</th><th className="font-normal">Language</th><th className="font-normal">Joined</th><th />
              </tr></thead>
              <tbody>
                {data?.items.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-3">{s.name || "—"} {!s.opted_in && <Badge>opted out</Badge>}</td>
                    <td className="font-mono text-xs text-ink-2">{s.phone}</td>
                    <td className="text-ink-2">{s.community || "—"}</td>
                    <td className="text-ink-2">{s.lga ?? "—"}</td>
                    <td>{LANG[s.language] ?? s.language}</td>
                    <td className="text-ink-2">{fmtDate(s.created_at)}</td>
                    <td className="text-right">{s.opted_in && <button onClick={() => erase(s)} className="text-xs text-crimson hover:underline">Erase</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !data.items.length && <Empty>No subscribers yet.</Empty>}
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <h2 className="px-6 pb-4 pt-6 text-[19px] font-semibold">Coverage</h2>
          <MapView height={520} layers={{ subscribers: points }} />
        </Panel>
      </div>
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add subscriber">
        <NewSubscriber onCreated={() => { setAdding(false); reload(); }} />
      </Drawer>
    </>
  );
}

function NewSubscriber({ onCreated }: { onCreated: () => void }) {
  const lgas = useApi<{ id: number; name: string; state: string }[]>("/api/geo/lgas");
  const [f, setF] = useState({ phone: "", name: "", language: "en", community: "", lga_id: "" });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post("/api/subscribers", { ...f, lga_id: f.lga_id ? Number(f.lga_id) : null });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <Field label="Phone number" hint="Nigerian format, e.g. 0803 123 4567"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required inputMode="tel" /></Field>
      <Field label="Name (optional)"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Community / village"><input className={inputCls} value={f.community} onChange={(e) => setF({ ...f, community: e.target.value })} /></Field>
      <Field label="LGA" hint="Alerts are targeted by distance from the LGA centre unless a precise location is set.">
        <select className={inputCls} value={f.lga_id} onChange={(e) => setF({ ...f, lga_id: e.target.value })} required>
          <option value="">Select LGA…</option>
          {lgas.data?.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.state})</option>)}
        </select>
      </Field>
      <Field label="Alert language">
        <select className={inputCls} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
          {Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[var(--primary)]" />
        The person has agreed to receive safety alerts by SMS and knows they can reply STOP to opt out.
      </label>
      <Button type="submit" disabled={!consent} className="w-full">Add subscriber</Button>
    </form>
  );
}
