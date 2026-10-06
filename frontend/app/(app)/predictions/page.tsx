"use client";
import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Empty, PageTitle, Panel, SectionTitle } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDate, label } from "@/lib/format";

type Metrics = { pr_auc?: number; roc_auc?: number; brier?: number; top5_capture?: number; base_rate?: number; positives?: number };
type Weeks = {
  model: null | {
    version: string; trained_through: string; created_at: string;
    metrics: {
      summary: Record<string, number>;
      folds: { test_start: string; model: Metrics; baseline: Metrics }[];
      feature_importance?: { feature: string; gain_splits: number }[];
    };
  };
  weeks: string[];
};
type RiskFC = GeoJSON.FeatureCollection<GeoJSON.Polygon, { cell: string; p: number; state: string; actual: number }> & {
  week: string; actual_total: number; actual_in_shown: number;
};

const FEATURE_LABEL: Record<string, string> = {
  lag1: "Incidents last week", sum4: "Incidents, last 4 weeks", sum12: "Incidents, last 12 weeks",
  sum52: "Incidents, last year", fat12: "Fatalities, last 12 weeks", weeks_since_last: "Weeks since last incident",
  nbr1_sum4: "Neighbour incidents, 4 weeks", nbr1_sum12: "Neighbour incidents, 12 weeks",
  nbr2_sum12: "2nd-ring incidents, 12 weeks", nbr1_sum52: "Neighbour incidents, last year",
  fires1: "Satellite fires last week", fires4: "Satellite fires, 4 weeks", nbr1_fires1: "Neighbour fires last week",
  precip4: "Rainfall, 4 weeks", precip_anom4: "Rainfall anomaly", month: "Month", dry_season: "Dry season",
  woy_sin: "Season (sin)", woy_cos: "Season (cos)", lat: "Latitude", lon: "Longitude",
  dist_state_border_km: "Distance to state border", dist_lga_border_km: "Distance to LGA border", is_benue: "State",
};

export default function PredictionsPage() {
  const { version } = useLive();
  const meta = useApi<Weeks>(`/api/geo/risk/weeks?v=${version}`);
  const weeks = meta.data?.weeks ?? [];
  const [idx, setIdx] = useState<number | null>(null);
  useEffect(() => { if (weeks.length && idx === null) setIdx(weeks.length - 1); }, [weeks.length, idx]);
  const week = idx !== null ? weeks[idx] : null;
  const risk = useApi<RiskFC>(week ? `/api/geo/risk?week=${encodeURIComponent(week)}&min_probability=0.01` : null);
  const end = week ? new Date(new Date(week).getTime() + 14 * 864e5).toISOString() : null;
  const actual = useApi<GeoJSON.FeatureCollection>(week && end ? `/api/incidents/geojson?start=${encodeURIComponent(week)}&end=${end}` : null);
  const boundaries = useApi<GeoJSON.FeatureCollection>("/api/geo/admin-areas?level=2");

  const m = meta.data?.model;
  const baseRate = useMemo(() => {
    const r = (m?.metrics.folds ?? []).map((f) => f.model.base_rate).filter((x): x is number => x != null);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
  }, [m]);
  const top = [...(risk.data?.features ?? [])].sort((a, b) => b.properties.p - a.properties.p).slice(0, 10);
  const isForecast = week && idx === weeks.length - 1;

  if (meta.data && !m) {
    return (<><PageTitle title="Predictions" /><Panel className="p-6"><Empty>No model has been trained yet. Run <code>python -m app.cli train score</code>.</Empty></Panel></>);
  }

  return (
    <>
      <PageTitle title="Predictions" />
      <div className="mb-6 flex items-start gap-2 rounded-sm border border-line bg-surface px-4 py-3 text-sm text-ink-2">
        <TriangleAlert size={18} className="mt-px shrink-0 text-[#b07a00]" />
        These are statistical estimates of where incidents are more likely in the next two weeks, learned from past
        location, timing, satellite-fire and rainfall patterns. They are not certainties and use no ethnic or religious
        information. A human reviews every alert before it is sent.
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Panel className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 px-6 pb-4 pt-6">
            <h2 className="text-[19px] font-semibold">
              {week ? `Week of ${fmtDate(week)}` : "…"}{" "}
              <span className="text-sm font-normal text-muted">{isForecast ? "· current forecast" : "· backtest (what the model said then)"}</span>
            </h2>
            {weeks.length > 1 && idx !== null && (
              <input type="range" min={0} max={weeks.length - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))}
                className="ml-auto w-full max-w-xs accent-[var(--primary)]" aria-label="Week" />
            )}
          </div>
          <MapView height={600} layers={{ risk: risk.data, boundaries: boundaries.data, incidents: actual.data }} />
          <div className="flex flex-wrap items-center gap-4 px-6 py-3 text-xs text-ink-2">
            <span>2-week probability</span>
            <span className="h-2.5 w-40 bg-[linear-gradient(90deg,#fff5dc,#ffc857,#f26b5b,#b3182b)]" />
            <span>1 % → 10 %+</span>
            <span className="ml-4 flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#8e3e91]" />incidents that actually occurred</span>
            {risk.data && !isForecast && (
              <span className="ml-auto">
                {risk.data.actual_in_shown} of {risk.data.actual_total} incidents fell in shaded cells
              </span>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel className="p-6">
            <SectionTitle>Highest-risk areas</SectionTitle>
            <ol className="space-y-2 text-sm">
              {top.map((f, i) => (
                <li key={f.properties.cell} className="flex items-center justify-between gap-3">
                  <span className="text-muted tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate">{f.properties.state} · <span className="font-mono text-xs text-muted">{f.properties.cell}</span></span>
                  <span className="tabular-nums">{(f.properties.p * 100).toFixed(1)} %</span>
                  {baseRate && <span className="w-16 text-right text-xs text-muted">{Math.round(f.properties.p / baseRate)}× avg</span>}
                </li>
              ))}
              {!top.length && <Empty>No scores for this week.</Empty>}
            </ol>
          </Panel>

          {m && (
            <Panel className="p-6">
              <SectionTitle>Model performance</SectionTitle>
              <p className="-mt-3 mb-4 text-xs text-muted">{m.version} · trained through {fmtDate(m.trained_through)} · averaged over {m.metrics.folds.length} rolling 26-week test periods</p>
              <table className="w-full text-sm">
                <thead className="text-left text-muted"><tr><th className="pb-2 font-normal">Metric</th><th className="text-right font-normal">Model</th><th className="text-right font-normal">Baseline</th></tr></thead>
                <tbody>
                  {[
                    ["top5_capture", "Incidents caught in top 5 % of area", (v: number) => `${Math.round(v * 100)} %`],
                    ["roc_auc", "ROC-AUC (ranking)", (v: number) => v.toFixed(3)],
                    ["pr_auc", "PR-AUC", (v: number) => v.toFixed(3)],
                    ["brier", "Brier score (lower is better)", (v: number) => v.toFixed(4)],
                  ].map(([k, l, f]) => {
                    const fmt = f as (v: number) => string;
                    const mv = m.metrics.summary[`model_${k}`];
                    const bv = m.metrics.summary[`baseline_${k}`];
                    return (
                      <tr key={k as string} className="border-t border-line">
                        <td className="py-2 text-ink-2">{l as string}</td>
                        <td className="text-right font-medium tabular-nums">{mv != null ? fmt(mv) : "—"}</td>
                        <td className="text-right tabular-nums text-muted">{bv != null ? fmt(bv) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">Baseline = each area&apos;s own historical rate. The model should beat it to be worth using.</p>
            </Panel>
          )}

          {m?.metrics.feature_importance && (
            <Panel className="p-6">
              <SectionTitle>What drives the forecast</SectionTitle>
              <ul className="space-y-2 text-sm">
                {m.metrics.feature_importance.slice(0, 8).map((f) => {
                  const max = m.metrics.feature_importance![0].gain_splits || 1;
                  return (
                    <li key={f.feature}>
                      <div className="mb-1 text-ink-2">{FEATURE_LABEL[f.feature] ?? label(f.feature)}</div>
                      <div className="h-1.5 bg-canvas"><div className="h-full bg-[var(--teal)]" style={{ width: `${(f.gain_splits / max) * 100}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
