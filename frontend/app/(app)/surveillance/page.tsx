"use client";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VideoOff } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Button, Drawer, ErrorNote, Field, inputCls, PageTitle, Panel, SectionTitle } from "@/components/ui";
import { api, post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";

type Camera = { id: number; name: string; kind: "hls" | "mjpeg" | "image" | "embed"; url: string; lat: number | null; lon: number | null; license_note: string };
type Fires = GeoJSON.FeatureCollection & { latest_observation: string | null };

const tooltipStyle = { borderRadius: 4, border: "none", background: "var(--tooltip)", color: "#fff", fontSize: 13 };

export default function SurveillancePage() {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const cams = useApi<Camera[]>("/api/feeds/cameras");
  const fires = useApi<Fires>("/api/feeds/fires?days=7");
  const daily = useApi<{ day: string; count: number }[]>("/api/feeds/fires/daily?days=60");
  const rain = useApi<{ week: string; Benue?: number; Plateau?: number }[]>("/api/feeds/rainfall?weeks=26");
  const boundaries = useApi<GeoJSON.FeatureCollection>("/api/geo/admin-areas?level=2");
  const synthetic = fires.data?.features.some((f) => String(f.properties?.satellite).includes("synthetic"));

  return (
    <>
      <PageTitle title="Surveillance">
        {can("admin") && <Button onClick={() => setAdding(true)}>Register camera feed</Button>}
      </PageTitle>

      <Panel className="mb-6 p-6">
        <SectionTitle>Camera feeds</SectionTitle>
        {cams.data && !cams.data.length && (
          <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted">
            <VideoOff size={28} />
            <p className="max-w-lg">
              No camera feeds registered. Public CCTV coverage in rural Benue and Plateau is very limited, so the system relies on
              satellite fire detection and community SMS reports. Administrators can register feeds the organisation is
              permitted to use (own cameras, partner feeds, or streams published openly by their owner).
            </p>
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {cams.data?.map((c) => <CameraTile key={c.id} cam={c} onRemoved={cams.reload} />)}
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <Panel className="overflow-hidden">
          <div className="px-6 pb-4 pt-6">
            <h2 className="text-[19px] font-semibold">Satellite fire detections · last 7 days</h2>
            <p className="text-sm text-muted">
              NASA FIRMS VIIRS thermal anomalies. Most dry-season fires are agricultural; fires near recent incidents raise a draft alert.
              {fires.data?.latest_observation && ` Latest pass: ${fmtDateTime(fires.data.latest_observation)}.`}
              {synthetic && " Currently showing synthetic demo detections."}
            </p>
          </div>
          <MapView height={480} layers={{ fires: fires.data, boundaries: boundaries.data }} />
        </Panel>
        <div className="space-y-6">
          <Panel className="p-6">
            <SectionTitle>Fire detections per day</SectionTitle>
            <div className="h-48">
              <ResponsiveContainer>
                <BarChart data={daily.data ?? []} margin={{ left: -20, right: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-2)" }} minTickGap={30}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff" }} cursor={{ fill: "var(--canvas)" }} />
                  <Bar dataKey="count" name="detections" fill="#ff8a00" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel className="p-6">
            <SectionTitle>Weekly rainfall (mm, LGA average)</SectionTitle>
            <div className="h-48">
              <ResponsiveContainer>
                <LineChart data={rain.data ?? []} margin={{ left: -20, right: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-2)" }} minTickGap={30}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff" }} />
                  <Line type="monotone" dataKey="Benue" stroke="var(--teal)" dot={false} strokeWidth={1.6} />
                  <Line type="monotone" dataKey="Plateau" stroke="var(--crimson)" dot={false} strokeWidth={1.6} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted">Source: Open-Meteo (ERA5). Rainfall onset and failure shift herd movement and farm–grazing overlap.</p>
          </Panel>
        </div>
      </div>

      <Drawer open={adding} onClose={() => setAdding(false)} title="Register camera feed">
        <NewCamera onCreated={() => { setAdding(false); cams.reload(); }} />
      </Drawer>
    </>
  );
}

function CameraTile({ cam, onRemoved }: { cam: Camera; onRemoved: () => void }) {
  const { can } = useAuth();
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cam.kind !== "hls" || !video.current) return;
    const v = video.current;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = cam.url;
      return;
    }
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    import("hls.js").then(({ default: Hls }) => {
      if (destroyed) return;
      if (!Hls.isSupported()) return setFailed(true);
      const h = new Hls();
      h.on(Hls.Events.ERROR, (_e, d) => d.fatal && setFailed(true));
      h.loadSource(cam.url);
      h.attachMedia(v);
      hls = h;
    });
    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [cam.kind, cam.url]);

  return (
    <figure className="overflow-hidden rounded-sm border border-line">
      <div className="grid aspect-video place-items-center bg-black text-sm text-white/70">
        {failed ? <span>Feed unavailable</span>
          : cam.kind === "hls" ? <video ref={video} muted autoPlay playsInline controls className="size-full object-cover" />
          : cam.kind === "embed" ? <iframe src={cam.url} className="size-full" sandbox="allow-scripts allow-same-origin" title={cam.name} />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={cam.url} alt={cam.name} className="size-full object-cover" onError={() => setFailed(true)} />}
      </div>
      <figcaption className="flex items-start justify-between gap-3 p-3 text-sm">
        <div>
          <div className="font-medium">{cam.name}</div>
          <div className="text-xs text-muted">{cam.license_note}</div>
        </div>
        {can("admin") && (
          <button className="text-xs text-crimson hover:underline"
            onClick={async () => { await api(`/api/feeds/cameras/${cam.id}`, { method: "DELETE" }); onRemoved(); }}>Remove</button>
        )}
      </figcaption>
    </figure>
  );
}

function NewCamera({ onCreated }: { onCreated: () => void }) {
  const [f, setF] = useState({ name: "", kind: "hls", url: "", lat: "", lon: "", license_note: "" });
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await post("/api/feeds/cameras", { ...f, lat: f.lat ? Number(f.lat) : null, lon: f.lon ? Number(f.lon) : null });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {err && <ErrorNote>{err}</ErrorNote>}
      <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
      <Field label="Feed type">
        <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="hls">HLS stream (.m3u8)</option><option value="mjpeg">MJPEG stream</option>
          <option value="image">Still image (refreshing)</option><option value="embed">Embeddable player page</option>
        </select>
      </Field>
      <Field label="HTTPS URL"><input className={inputCls} type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} required /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude"><input className={inputCls} value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></Field>
        <Field label="Longitude"><input className={inputCls} value={f.lon} onChange={(e) => setF({ ...f, lon: e.target.value })} /></Field>
      </div>
      <Field label="Source and permission" hint="Who operates this feed and on what basis we may use it. Do not add cameras that were not intentionally made public by their owner.">
        <textarea className={inputCls} rows={3} value={f.license_note} onChange={(e) => setF({ ...f, license_note: e.target.value })} required minLength={10} />
      </Field>
      <Button type="submit" className="w-full">Register feed</Button>
    </form>
  );
}
