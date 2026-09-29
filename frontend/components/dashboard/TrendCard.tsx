"use client";
import { useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BigStat, Chip, Dropdown, RANGES, SectionTitle } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { fmtInt } from "@/lib/format";

type Trend = {
  points: { month: string; Benue: number; Plateau: number; Benue_fatalities: number; Plateau_fatalities: number }[];
  total_incidents: number;
  total_fatalities: number;
};

const SERIES = [
  { key: "Benue", color: "var(--teal)", fill: "#1b6e7e" },
  { key: "Plateau", color: "var(--crimson)", fill: "#b3182b" },
] as const;

export function TrendCard({ state, version }: { state: string; version: number }) {
  const [months, setMonths] = useState(6);
  const [metric, setMetric] = useState<"incidents" | "fatalities">("incidents");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const q = `/api/analytics/trend?months=${months}${state ? `&state=${state}` : ""}&v=${version}`;
  const { data } = useApi<Trend>(q);

  const rows = (data?.points ?? []).map((p) => ({
    month: new Date(`${p.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", ...(months > 12 && { year: "2-digit" }) }),
    Benue: metric === "incidents" ? p.Benue : p.Benue_fatalities,
    Plateau: metric === "incidents" ? p.Plateau : p.Plateau_fatalities,
  }));

  return (
    <div>
      <SectionTitle
        right={
          <div className="flex items-center gap-6">
            <Dropdown value={metric} onChange={setMetric}
              options={[{ value: "incidents", label: "incidents" }, { value: "fatalities", label: "fatalities" }]} />
            <Dropdown value={months} onChange={setMonths} options={RANGES} />
          </div>
        }
      >
        Incident tracking
      </SectionTitle>
      <div className="flex flex-wrap gap-x-12 gap-y-3">
        <BigStat value={fmtInt(data?.total_incidents)} caption="incidents" />
        <BigStat value={fmtInt(data?.total_fatalities)} caption="fatalities" />
      </div>

      <div className="mt-8 h-[420px] w-full">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.fill} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={s.fill} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--ink-2)" }} dy={10} />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: "var(--ink-2)" }} />
            <Tooltip
              contentStyle={{ borderRadius: 4, border: "none", background: "var(--tooltip)", color: "#fff", fontSize: 13 }}
              itemStyle={{ color: "#fff" }} labelStyle={{ color: "#fff", marginBottom: 4 }} cursor={{ stroke: "var(--line)" }}
            />
            {SERIES.filter((s) => !hidden[s.key]).map((s) => (
              <Area key={`a-${s.key}`} type="monotone" dataKey={s.key} stroke="none" fill={`url(#g-${s.key})`}
                isAnimationActive={false} tooltipType="none" />
            ))}
            {SERIES.filter((s) => !hidden[s.key]).map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={1.6}
                dot={{ r: 4, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 flex gap-3">
        {SERIES.map((s) => (
          <Chip key={s.key} color={s.color} active={false} onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))}>
            <span className={hidden[s.key] ? "text-muted line-through" : ""}>{s.key}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
