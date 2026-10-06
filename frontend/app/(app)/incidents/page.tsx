"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapView } from "@/components/MapView";
import {
  Badge, Button, Drawer, Dropdown, Empty, ErrorNote, Field, inputCls, PageTitle, Panel,
} from "@/components/ui";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDate, fmtDateTime, label } from "@/lib/format";

type Incident = {
  id: number; lat: number; lon: number; occurred_at: string; state: string | null; lga: string | null;
  location_name: string; type: string; cause: string | null; fatalities: number; injured: number; displaced: number;
  source: string; status: string; confidence: number; synthetic: boolean; notes?: string;
  timeline?: { status: string; at: string; note: string }[];
};

const STATUS_TONE: Record<string, "red" | "amber" | "blue" | "green" | "grey"> = {
  reported: "red", verified: "amber", responded: "blue", resolved: "green", closed: "grey", dismissed: "grey",
};
const NEXT: Record<string, string[]> = {
  reported: ["verified", "dismissed"], verified: ["responded", "dismissed"], responded: ["resolved"],
  resolved: ["closed"], closed: [], dismissed: [],
};
const PAGE = 25;

export default function IncidentsPage() {
  return <Suspense><Incidents /></Suspense>;
}

function Incidents() {
  const params = useSearchParams();
  const router = useRouter();
  const { version } = useLive();
  const [state, setState] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE), v: String(version) });
  if (state) qs.set("state", state);
  if (status) qs.set("status", status);
  if (source) qs.set("source", source);
  if (q) qs.set("q", q);
  const { data, error, reload } = useApi<{ total: number; items: Incident[] }>(`/api/incidents?${qs}`);

  const selected = params.get("id");
  const creating = params.get("new") === "1";
  const close = () => router.replace("/incidents");

  return (
    <>
      <PageTitle title="Incidents">
        <Button onClick={() => router.replace("/incidents?new=1")}>New incident</Button>
      </PageTitle>
      <Panel className="p-6">
        <div className="mb-6 flex flex-wrap items-center gap-6">
          <input className={`${inputCls} max-w-xs`} placeholder="Search location or notes" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          <Dropdown value={state} onChange={(v) => { setState(v); setPage(0); }}
            options={[{ value: "", label: "All states" }, { value: "Benue", label: "Benue" }, { value: "Plateau", label: "Plateau" }]} />
          <Dropdown value={status} onChange={(v) => { setStatus(v); setPage(0); }}
            options={[{ value: "", label: "Any status" }, ...Object.keys(NEXT).map((s) => ({ value: s, label: label(s) }))]} />
          <Dropdown value={source} onChange={(v) => { setSource(v); setPage(0); }}
            options={[{ value: "", label: "Any source" }, ...["community_sms", "field_agent", "acled", "firms", "upload"].map((s) => ({ value: s, label: label(s) }))]} />
          <span className="ml-auto text-sm text-muted">{data ? `${data.total} incidents` : ""}</span>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="pb-3 font-normal">Date</th><th className="font-normal">Location</th>
                <th className="font-normal">Type</th><th className="font-normal">Cause</th>
                <th className="text-right font-normal">Killed</th><th className="text-right font-normal">Displaced</th>
                <th className="pl-6 font-normal">Source</th><th className="font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((i) => (
                <tr key={i.id} onClick={() => router.replace(`/incidents?id=${i.id}`)}
                  className="cursor-pointer border-t border-line hover:bg-canvas">
                  <td className="py-3 text-ink-2">{fmtDate(i.occurred_at)}</td>
                  <td>{i.location_name || i.lga || "—"}<span className="block text-xs text-muted">{i.lga && i.location_name !== i.lga ? `${i.lga}, ` : ""}{i.state}</span></td>
                  <td>{label(i.type)}</td>
                  <td className="text-ink-2">{label(i.cause)}</td>
                  <td className="text-right tabular-nums">{i.fatalities}</td>
                  <td className="text-right tabular-nums">{i.displaced}</td>
                  <td className="pl-6 text-ink-2">{label(i.source)}{i.synthetic && <span className="ml-1 text-xs text-muted">(demo)</span>}</td>
                  <td><Badge tone={STATUS_TONE[i.status]}>{label(i.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.items.length && <Empty>No incidents match these filters.</Empty>}
        </div>
        {data && data.total > PAGE && (
          <div className="mt-6 flex items-center justify-end gap-3 text-sm">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-muted">Page {page + 1} of {Math.ceil(data.total / PAGE)}</span>
            <Button variant="ghost" disabled={(page + 1) * PAGE >= data.total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Panel>

      <Drawer open={!!selected} onClose={close} title={`Incident #${selected}`}>
        {selected && <IncidentDetail id={selected} onChanged={reload} />}
      </Drawer>
      <Drawer open={creating} onClose={close} title="New incident">
        <NewIncident onCreated={(id) => { reload(); router.replace(`/incidents?id=${id}`); }} />
      </Drawer>
    </>
  );
}

function IncidentDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { can } = useAuth();
  const { data, error, reload } = useApi<Incident>(`/api/incidents/${id}`);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function move(status: string) {
    setBusy(true);
    setErr(null);
    try {
      await post(`/api/incidents/${id}/status`, { status, note });
      setNote("");
      reload();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="text-muted">Loading…</div>;
  const point: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [data.lon, data.lat] },
      properties: { status: data.status, fatalities: data.fatalities } }],
  };
  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[data.status]}>{label(data.status)}</Badge>
        <span className="text-muted">{label(data.type)} · {fmtDateTime(data.occurred_at)}</span>
        {data.synthetic && <Badge tone="amber">synthetic demo record</Badge>}
      </div>
      <div className="overflow-hidden rounded-sm border border-line"><MapView height={220} layers={{ incidents: point }} /></div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Item k="Location" v={data.location_name || "—"} />
        <Item k="LGA / State" v={`${data.lga ?? "—"}, ${data.state ?? "—"}`} />
        <Item k="Coordinates" v={`${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`} />
        <Item k="Cause" v={label(data.cause)} />
        <Item k="Killed / injured" v={`${data.fatalities} / ${data.injured}`} />
        <Item k="Displaced" v={String(data.displaced)} />
        <Item k="Source" v={label(data.source)} />
        <Item k="Confidence" v={`${Math.round(data.confidence * 100)} %`} />
      </dl>
      {data.notes && <p className="whitespace-pre-wrap rounded-sm bg-canvas p-3 text-ink-2">{data.notes}</p>}

      <div>
        <h3 className="mb-3 font-semibold">Timeline</h3>
        <ol className="space-y-3 border-l border-line pl-4">
          {data.timeline?.map((t, i) => (
            <li key={i}>
              <span className="font-medium">{label(t.status)}</span>
              <span className="ml-2 text-muted">{fmtDateTime(t.at)}</span>
              {t.note && <p className="text-ink-2">{t.note}</p>}
            </li>
          ))}
        </ol>
      </div>

      {can("analyst") && NEXT[data.status].length > 0 && (
        <div className="space-y-3 border-t border-line pt-5">
          <h3 className="font-semibold">Update status</h3>
          {err && <ErrorNote>{err}</ErrorNote>}
          <textarea className={inputCls} rows={2} placeholder="Note (optional): who verified, what response was sent…"
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            {NEXT[data.status].map((s) => (
              <Button key={s} disabled={busy} variant={s === "dismissed" ? "danger" : "primary"} onClick={() => move(s)}>
                {s === "dismissed" ? "Dismiss as false report" : `Mark ${s}`}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (<div><dt className="text-muted">{k}</dt><dd>{v}</dd></div>);
}

function NewIncident({ onCreated }: { onCreated: (id: number) => void }) {
  const [f, setF] = useState({
    lat: "", lon: "", occurred_at: "", type: "attack", cause: "unknown", fatalities: "0", injured: "0",
    displaced: "0", location_name: "", notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF((s) => ({ ...s, occurred_at: new Date().toISOString().slice(0, 16) })), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: number }>("/api/incidents", {
        method: "POST",
        body: JSON.stringify({
          ...f, lat: Number(f.lat), lon: Number(f.lon), occurred_at: new Date(f.occurred_at).toISOString(),
          fatalities: Number(f.fatalities), injured: Number(f.injured), displaced: Number(f.displaced),
        }),
      });
      onCreated(r.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pin: GeoJSON.FeatureCollection | null = f.lat && f.lon ? {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "Point", coordinates: [Number(f.lon), Number(f.lat)] }, properties: { status: "reported", fatalities: 0 } }],
  } : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <p className="text-sm text-muted">Click the map to set the location, or type coordinates.</p>
      <div className="overflow-hidden rounded-sm border border-line">
        <MapView height={220} layers={{ incidents: pin }}
          onMapClick={(lat, lon) => setF((s) => ({ ...s, lat: lat.toFixed(5), lon: lon.toFixed(5) }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude"><input className={inputCls} value={f.lat} onChange={set("lat")} required inputMode="decimal" /></Field>
        <Field label="Longitude"><input className={inputCls} value={f.lon} onChange={set("lon")} required inputMode="decimal" /></Field>
      </div>
      <Field label="Date and time"><input className={inputCls} type="datetime-local" value={f.occurred_at} onChange={set("occurred_at")} required /></Field>
      <Field label="Location / village"><input className={inputCls} value={f.location_name} onChange={set("location_name")} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={inputCls} value={f.type} onChange={set("type")}>
            {["attack", "cattle_rustling", "crop_destruction", "reprisal", "clash", "other"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
        <Field label="Cause">
          <select className={inputCls} value={f.cause} onChange={set("cause")}>
            {["unknown", "crop_destruction", "cattle_rustling", "reprisal", "land_dispute"].map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Killed"><input className={inputCls} type="number" min={0} value={f.fatalities} onChange={set("fatalities")} /></Field>
        <Field label="Injured"><input className={inputCls} type="number" min={0} value={f.injured} onChange={set("injured")} /></Field>
        <Field label="Displaced"><input className={inputCls} type="number" min={0} value={f.displaced} onChange={set("displaced")} /></Field>
      </div>
      <Field label="Notes"><textarea className={inputCls} rows={3} value={f.notes} onChange={set("notes")} /></Field>
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save incident"}</Button>
    </form>
  );
}
