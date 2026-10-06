"use client";
import { useState } from "react";
import { MapView } from "@/components/MapView";
import { Badge, Button, Empty, PageTitle, Panel, SectionTitle } from "@/components/ui";
import { post } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDate, fmtInt } from "@/lib/format";

type HotspotFC = GeoJSON.FeatureCollection<GeoJSON.Geometry, {
  id: number; kind: "gi" | "cluster"; label: string; incident_count: number; fatalities: number;
  z_score: number | null; period_start: string; period_end: string;
}>;

function centroid(g: GeoJSON.Geometry): [number, number] {
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : [];
  const n = ring.length || 1;
  return [ring.reduce((s, c) => s + c[1], 0) / n, ring.reduce((s, c) => s + c[0], 0) / n];
}

export default function HotspotsPage() {
  const { can } = useAuth();
  const { version } = useLive();
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState(12);
  const { data, reload } = useApi<HotspotFC>(`/api/geo/hotspots?v=${version}`);
  const boundaries = useApi<GeoJSON.FeatureCollection>("/api/geo/admin-areas?level=2");
  const clusters = (data?.features ?? []).filter((f) => f.properties.kind === "cluster")
    .sort((a, b) => b.properties.incident_count - a.properties.incident_count);
  const gi = (data?.features ?? []).filter((f) => f.properties.kind === "gi");
  const period = data?.features[0]?.properties;

  async function recompute() {
    setBusy(true);
    try {
      await post(`/api/geo/hotspots/recompute?months=${months}`);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="Hotspots">
        {can("analyst") && (
          <>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-[4px] border border-line bg-surface px-3 py-2 text-[15px]">
              {[3, 6, 12, 24, 36].map((m) => <option key={m} value={m}>last {m} months</option>)}
            </select>
            <Button onClick={recompute} disabled={busy}>{busy ? "Recomputing…" : "Recompute"}</Button>
          </>
        )}
      </PageTitle>

      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <Panel className="p-6"><div className="display-num text-[42px]">{fmtInt(clusters.length)}</div><p className="mt-2 text-ink-2">incident clusters (HDBSCAN)</p></Panel>
        <Panel className="p-6"><div className="display-num text-[42px]">{fmtInt(gi.filter((f) => f.properties.label === "99%").length)}</div><p className="mt-2 text-ink-2">cells hot at 99 % confidence</p></Panel>
        <Panel className="p-6"><div className="display-num text-[42px]">{fmtInt(gi.length)}</div><p className="mt-2 text-ink-2">significant cells (90 %+)</p></Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="overflow-hidden">
          <MapView height={620} layers={{ hotspots: data, boundaries: boundaries.data }} />
          <div className="flex flex-wrap gap-4 px-6 py-3 text-xs text-ink-2">
            <span className="flex items-center gap-1.5"><i className="size-3 bg-[#b3182b]/60" />Gi* 99 %</span>
            <span className="flex items-center gap-1.5"><i className="size-3 bg-[#f26b5b]/60" />Gi* 95 %</span>
            <span className="flex items-center gap-1.5"><i className="size-3 bg-[#ffc857]/60" />Gi* 90 %</span>
            <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t-2 border-dashed border-[#3a3a5c]" />Cluster outline</span>
          </div>
        </Panel>
        <Panel className="p-6">
          <SectionTitle>Clusters</SectionTitle>
          {period && <p className="-mt-3 mb-4 text-sm text-muted">Incidents from {fmtDate(period.period_start)} to {fmtDate(period.period_end)}</p>}
          {!clusters.length && <Empty>No clusters in this period.</Empty>}
          <ul className="divide-y divide-line">
            {clusters.map((c) => {
              const [lat, lon] = centroid(c.geometry);
              return (
                <li key={c.properties.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">{c.properties.label}</div>
                    <div className="text-xs text-muted">{lat.toFixed(3)}, {lon.toFixed(3)}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums">{c.properties.incident_count} incidents</div>
                    <div className="text-xs text-muted">{c.properties.fatalities} killed</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-sm bg-canvas p-4 text-xs leading-relaxed text-ink-2">
            <b>How to read this.</b> Clusters outline places where incidents bunch together. Gi* cells are ~36 km² hexagons whose
            neighbourhood has significantly more incidents than the two-state average. <Badge>99 %</Badge> means a pattern this
            strong would arise by chance less than 1 % of the time.
          </div>
        </Panel>
      </div>
    </>
  );
}
