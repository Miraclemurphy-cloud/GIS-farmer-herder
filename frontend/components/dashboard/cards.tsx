"use client";
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { BigStat, Chip, SectionTitle, StackedStat, Swatch } from "@/components/ui";
import { fmtDuration, fmtInt, label } from "@/lib/format";

export type Dashboard = {
  active_incidents: number;
  pipeline: { status: string; count: number; people_affected: number; avg_hours_in_stage: number | null }[];
  sources: { source: string; reports: number; verified: number; fatalities: number }[];
  causes: { cause: string; count: number; pct: number }[];
  kpis: {
    total_incidents: number; fatalities: number; displaced: number; avg_hours_to_verify: number | null;
    high_risk_cells: number; risk_week: string | null; alerts_pending: number; alerts_sent_window: number;
  };
  synthetic_data: boolean;
};

const PIPE_COLORS: Record<string, string> = {
  reported: "var(--s1)", verified: "var(--s2)", responded: "var(--s3)", resolved: "var(--s4)", closed: "var(--s5)",
};
const SOURCE_COLORS: Record<string, string> = {
  community_sms: "var(--s1)", field_agent: "var(--s2)", acled: "var(--s6)", firms: "var(--s4)",
  upload: "var(--s3)",
};
const SOURCE_LABEL: Record<string, string> = {
  community_sms: "Community SMS", field_agent: "Field agents", acled: "ACLED", firms: "Satellite (FIRMS)",
  upload: "Uploads",
};

export function PipelineCard({ d }: { d: Dashboard }) {
  const total = d.pipeline.reduce((s, p) => s + p.count, 0) || 1;
  return (
    <div>
      <SectionTitle>Incident pipeline</SectionTitle>
      <BigStat value={fmtInt(d.active_incidents)} caption="active incidents" />
      <div className="mt-5 flex h-[7px] w-full overflow-hidden">
        {d.pipeline.map((p) => (
          <div key={p.status} style={{ width: `${(p.count / total) * 100}%`, background: PIPE_COLORS[p.status] }} />
        ))}
      </div>
      <table className="mt-6 w-full text-[15px]">
        <tbody>
          {d.pipeline.map((p) => (
            <tr key={p.status} className="h-[51px]">
              <td className="w-8"><Swatch color={PIPE_COLORS[p.status]} /></td>
              <td className="text-ink-2">{label(p.status)}</td>
              <td className="w-20 text-right tabular-nums text-ink-2">{fmtInt(p.count)}</td>
              <td className="hidden w-36 text-right tabular-nums text-ink-2 sm:table-cell">
                <span className="text-muted">affected</span>&nbsp; {fmtInt(p.people_affected)}
              </td>
              <td className="w-28 text-right text-muted">
                <span className="tip cursor-default" data-tip="average time on this stage">
                  {p.status === "closed" ? "—" : fmtDuration(p.avg_hours_in_stage)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Metric = "reports" | "verified" | "fatalities";
const METRICS: { value: Metric; label: string }[] = [
  { value: "reports", label: "Reports received" },
  { value: "verified", label: "Verified" },
  { value: "fatalities", label: "Fatalities" },
];

export function SourcesCard({ d }: { d: Dashboard }) {
  const [metric, setMetric] = useState<Metric>("verified");
  const rows = d.sources.map((s) => ({ name: s.source, value: s[metric] })).filter((r) => r.value > 0);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div className="flex h-full flex-col">
      <SectionTitle>Report sources</SectionTitle>
      <div className="flex flex-1 flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className="size-[230px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="100%" startAngle={90}
                endAngle={-270} stroke="none" isAnimationActive={false}>
                {rows.map((r) => <Cell key={r.name} fill={SOURCE_COLORS[r.name] ?? "var(--muted)"} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [fmtInt(Number(v)), SOURCE_LABEL[String(n)] ?? String(n)]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <table className="w-full text-[15px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="h-[51px]">
                <td className="w-8"><Swatch color={SOURCE_COLORS[r.name] ?? "var(--muted)"} /></td>
                <td className="text-ink-2">{SOURCE_LABEL[r.name] ?? label(r.name)}</td>
                <td className="text-right tabular-nums text-ink-2">{fmtInt(r.value)}</td>
                <td className="w-20 text-right text-muted">
                  <span className="tip cursor-default" data-tip="share of total">{Math.round((r.value / total) * 100)} %</span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="py-8 text-center text-muted">No reports in this period</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {METRICS.map((m) => (
          <Chip key={m.value} active={metric === m.value} onClick={() => setMetric(m.value)}>{m.label}</Chip>
        ))}
      </div>
    </div>
  );
}

export function CausesCard({ d }: { d: Dashboard }) {
  const top = d.causes.slice(0, 4);
  return (
    <div>
      <SectionTitle>Causes of incidents</SectionTitle>
      <div className="grid grid-cols-2 gap-x-10 gap-y-10">
        {top.map((c) => (
          <div key={c.cause}>
            <div className="display-num text-[42px] text-ink">{Math.round(c.pct)}%</div>
            <div className="mt-2 text-[15px] text-ink-2">{label(c.cause)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OtherDataCard({ d }: { d: Dashboard }) {
  const k = d.kpis;
  const verifyDays = k.avg_hours_to_verify != null ? k.avg_hours_to_verify / 24 : null;
  return (
    <div>
      <SectionTitle>Other data</SectionTitle>
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        <StackedStat value={fmtInt(k.total_incidents)} caption="total incidents in period" />
        <StackedStat
          value={verifyDays == null ? "—" : verifyDays < 2 ? Math.round(k.avg_hours_to_verify!) : verifyDays.toFixed(1)}
          caption={verifyDays != null && verifyDays < 2 ? "hours on average to verify a report" : "days on average to verify a report"}
        />
        <StackedStat value={fmtInt(k.high_risk_cells)} caption="high-risk areas this week"
          hint="~36 km² cells whose predicted 2-week risk is above the alert threshold" />
        <StackedStat value={fmtInt(k.fatalities)} caption="fatalities in period" />
        <StackedStat value={fmtInt(k.displaced)} caption="people displaced" />
        <StackedStat value={fmtInt(k.alerts_pending)} caption="alerts awaiting approval" />
      </div>
    </div>
  );
}
