"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { MapView } from "@/components/MapView";
import { Dropdown, PageTitle, Panel, RANGES } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDate, fmtDateTime, label } from "@/lib/format";

type FC = GeoJSON.FeatureCollection;
const LAYERS = [
  { key: "incidents", label: "Incidents", swatch: "#f26b5b" },
  { key: "hotspots", label: "Hotspots (Gi* + clusters)", swatch: "#b3182b" },
  { key: "risk", label: "Predicted risk (this week)", swatch: "#ffc857" },
  { key: "fires", label: "Satellite fires (7 days)", swatch: "#ff8a00" },
  { key: "boundaries", label: "LGA boundaries", swatch: "#5f6470" },
] as const;
type Key = (typeof LAYERS)[number]["key"];

export default function MapPage() {
  const { version } = useLive();
  const [months, setMonths] = useState(6);
  const [on, setOn] = useState<Record<Key, boolean>>({ incidents: true, hotspots: true, risk: false, fires: false, boundaries: true });
  const [picked, setPicked] = useState<{ kind: string; props: Record<string, unknown> } | null>(null);
  const start = useMemo(() => new Date(Date.now() - months * 30.44 * 864e5).toISOString(), [months]);

  const incidents = useApi<FC>(on.incidents ? `/api/incidents/geojson?start=${start}&v=${version}` : null);
  const hotspots = useApi<FC>(on.hotspots ? `/api/geo/hotspots?v=${version}` : null);
  const risk = useApi<FC>(on.risk ? `/api/geo/risk?v=${version}` : null);
  const fires = useApi<FC>(on.fires ? `/api/feeds/fires?days=7&v=${version}` : null);
  const boundaries = useApi<FC>(on.boundaries ? "/api/geo/admin-areas?level=2" : null);

  return (
    <>
      <PageTitle title="Map">
        <Dropdown value={months} onChange={setMonths} options={RANGES} icon />
      </PageTitle>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Panel className="overflow-hidden">
          <MapView height="calc(100vh - 190px)" onSelect={(kind, props) => setPicked({ kind, props })}
            layers={{
              incidents: on.incidents ? incidents.data : null, hotspots: on.hotspots ? hotspots.data : null,
              risk: on.risk ? risk.data : null, fires: on.fires ? fires.data : null,
              boundaries: on.boundaries ? boundaries.data : null,
            }} />
        </Panel>
        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="mb-4 font-semibold">Layers</h2>
            <ul className="space-y-3 text-sm">
              {LAYERS.map((l) => (
                <li key={l.key}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={on[l.key]} onChange={() => setOn({ ...on, [l.key]: !on[l.key] })}
                      className="size-4 accent-[var(--primary)]" />
                    <span className="size-3 rounded-sm" style={{ background: l.swatch }} />
                    {l.label}
                  </label>
                </li>
              ))}
            </ul>
            {on.risk && risk.error && <p className="mt-3 text-xs text-muted">No risk forecast yet: {risk.error}</p>}
          </Panel>
          <Panel className="p-5 text-sm">
            <h2 className="mb-3 font-semibold">Selection</h2>
            {picked ? <Selected {...picked} /> : <p className="text-muted">Click a point, hexagon or outline on the map.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Selected({ kind, props: p }: { kind: string; props: Record<string, unknown> }) {
  const rows: [string, React.ReactNode][] = [];
  if (kind === "incidents") {
    rows.push(["Incident", <Link key="l" className="text-primary hover:underline" href={`/incidents?id=${p.id}`}>#{String(p.id)}</Link>],
      ["Location", String(p.location_name || "—")], ["Date", fmtDate(String(p.occurred_at))], ["Type", label(String(p.type))],
      ["Killed", String(p.fatalities)], ["Status", label(String(p.status))]);
  } else if (kind === "risk") {
    rows.push(["Cell", String(p.cell)], ["2-week probability", `${(Number(p.p) * 100).toFixed(1)} %`],
      ["Incidents that followed", String(p.actual)]);
  } else if (kind.startsWith("hotspots")) {
    rows.push(["Hotspot", String(p.kind === "gi" ? `Gi* significant (${p.label})` : p.label)],
      ["Incidents", String(p.incident_count)], ["Fatalities", String(p.fatalities)]);
    if (p.z_score != null) rows.push(["z-score", Number(p.z_score).toFixed(2)]);
  } else if (kind === "fires") {
    rows.push(["Fire detection", fmtDateTime(String(p.observed_at))], ["Radiative power", `${p.frp} MW`],
      ["Satellite", String(p.satellite)], ["Confidence", String(p.confidence)]);
  } else {
    rows.push(["LGA", String(p.name)], ["State", String(p.state)]);
  }
  return (
    <dl className="space-y-2">
      {rows.map(([k, v]) => (<div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right">{v}</dd></div>))}
    </dl>
  );
}
