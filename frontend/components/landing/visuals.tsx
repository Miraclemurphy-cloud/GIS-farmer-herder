/** Decorative visuals for the landing page, drawn in the dashboard theme. Illustrative only — not live data. */
import { Bell, Camera, Flame, LayoutGrid, Map, Radar, ShieldAlert, TrendingUp, Upload, Users } from "lucide-react";

const HEX_W = 34;
const HEX_H = 30;
// Same ramp as the risk layer on the map page.
const RISK = ["#fff5dc", "#ffc857", "#f26b5b", "#b3182b"];

function hexPath(cx: number, cy: number, r: number) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

// Deterministic pseudo-random so server and client render the same SVG.
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function HexField() {
  const cols = 15;
  const rows = 11;
  const hot = [
    { c: 4, r: 3, s: 2.6 },
    { c: 10, r: 6, s: 2.2 },
    { c: 7, r: 8, s: 1.6 },
  ];
  const cells = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx = 20 + c * HEX_W * 0.75 * 1.14;
      const cy = 20 + r * HEX_H + (c % 2 ? HEX_H / 2 : 0);
      const heat = hot.reduce((m, h) => Math.max(m, Math.exp(-((c - h.c) ** 2 + (r - h.r) ** 2) / h.s ** 2)), 0);
      cells.push({ cx, cy, heat: Math.min(1, heat + rand(c * 31 + r) * 0.12), k: `${c}-${r}` });
    }
  }
  const fill = (h: number) => (h > 0.75 ? RISK[3] : h > 0.5 ? RISK[2] : h > 0.3 ? RISK[1] : h > 0.15 ? RISK[0] : "#f1f2f4");
  return (
    <svg viewBox="0 0 440 360" className="h-auto w-full" role="img" aria-label="Illustration of a hexagon risk map with three hotspots">
      {cells.map(({ cx, cy, heat, k }) => (
        <path key={k} d={hexPath(cx, cy, 16)} fill={fill(heat)} stroke="#ffffff" strokeWidth={1.5} />
      ))}
    </svg>
  );
}

const SMS = [
  { lang: "English", text: "ALERT (HIGH): Elevated risk of violence around Guma in the next 2 weeks. Avoid isolated farms at night. Reply STOP to opt out." },
  { lang: "Hausa", text: "GARGADI: Akwai hadarin tashin hankali a kewayen Guma cikin makonni 2. Ku guji gonaki na kadaici da dare." },
];

export function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="rounded-[44px] bg-ink p-3 shadow-[0_40px_90px_rgb(31_35_48/0.25)]">
        <div className="rounded-[34px] bg-canvas px-4 pb-6 pt-5 text-ink">
          <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-black/15" />
          <div className="mb-4 text-center">
            <div className="text-[13px] font-semibold">Community Alert</div>
            <div className="text-[11px] text-muted">Text message · Today 18:42</div>
          </div>
          <div className="space-y-3">
            {SMS.map((m) => (
              <div key={m.lang}>
                <div className="mb-1 pl-1 text-[11px] text-muted">{m.lang}</div>
                <div className="rounded-2xl rounded-tl-md border border-line bg-surface p-3 text-[13.5px] leading-snug">{m.text}</div>
              </div>
            ))}
            <div className="ml-auto w-fit rounded-2xl rounded-tr-md bg-primary px-3 py-2 text-[13.5px] text-white">REPORT Guma: smoke near Yelwata</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareBars() {
  return (
    <div className="space-y-5 rounded-sm bg-surface p-7" aria-hidden>
      <div className="text-[13px] font-semibold uppercase tracking-wider text-muted">Every model is checked against</div>
      {[
        { label: "A simple baseline: “where it happened before”", w: "62%", c: "bg-[#d5d7dd]" },
        { label: "The forecast: history + neighbours + fires + rainfall + season", w: "78%", c: "bg-primary" },
      ].map((b) => (
        <div key={b.label}>
          <div className="mb-2 text-[15px] text-ink-2">{b.label}</div>
          <div className="h-[7px] bg-canvas"><div className={`h-full ${b.c}`} style={{ width: b.w }} /></div>
        </div>
      ))}
      <p className="text-[14px] leading-snug text-muted">Tested on months it never saw. If it can&apos;t beat the baseline, it doesn&apos;t ship.</p>
    </div>
  );
}

/* ---------------- Dashboard preview ---------------- */

const PIPE = [
  { label: "Reported", n: 11, h: "44 hours", c: "var(--s1)" },
  { label: "Verified", n: 11, h: "34 hours", c: "var(--s2)" },
  { label: "Responded", n: 10, h: "9 days", c: "var(--s3)" },
  { label: "Resolved", n: 6, h: "9 days", c: "var(--s4)" },
  { label: "Closed", n: 35, h: "—", c: "var(--s5)" },
];
const SOURCES = [
  { label: "Community SMS", v: 52, c: "var(--s1)" },
  { label: "Field agents", v: 22, c: "var(--s2)" },
  { label: "Uploads", v: 16, c: "var(--s3)" },
  { label: "Satellite (FIRMS)", v: 10, c: "var(--s4)" },
];
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const BENUE = [9, 7, 5, 3, 2, 6];
const PLATEAU = [9, 6, 8, 5, 7, 6];
const SIDE = [LayoutGrid, ShieldAlert, Map, Flame, TrendingUp, Bell, Users, Camera, Upload];

/** Smooth Catmull-Rom → cubic Bézier path through points. */
function smooth(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1] ?? pts[i], pts[i], pts[i + 1], pts[i + 2] ?? pts[i + 1]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function TrendMini() {
  const W = 1000, H = 190, pad = 20, max = 10;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (MONTHS.length - 1);
  const y = (v: number) => H - 22 - (v / max) * (H - 40);
  const series = [
    { data: BENUE, color: "#1b6e7e" },
    { data: PLATEAU, color: "#b3182b" },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      <defs>
        {series.map((s) => (
          <linearGradient key={s.color} id={`pv-${s.color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity="0.12" />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 5, 10].map((g) => <line key={g} x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke="#ececef" />)}
      {series.map((s) => {
        const pts = s.data.map((v, i) => [x(i), y(v)] as [number, number]);
        const line = smooth(pts);
        return (
          <g key={s.color}>
            <path d={`${line} L${x(MONTHS.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#pv-${s.color.slice(1)})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="1.6" />
            {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="3.5" fill={s.color} stroke="#fff" strokeWidth="1.5" />)}
          </g>
        );
      })}
      {MONTHS.map((m, i) => <text key={m} x={x(i)} y={H - 4} textAnchor="middle" fontSize="12" fill="#4a4f5c">{m}</text>)}
    </svg>
  );
}

function Donut() {
  const r = 38, C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-[118px] shrink-0 -rotate-90" aria-hidden>
      {SOURCES.map((s) => {
        const len = (s.v / 100) * C;
        const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.c} strokeWidth="20" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
        offset += len;
        return el;
      })}
    </svg>
  );
}

/** A framed, static replica of the dashboard to show what staff see. */
export function DashboardPreview() {
  const total = PIPE.reduce((s, p) => s + p.n, 0);
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_40px_100px_rgb(31_35_48/0.14)]">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-3">
        <span className="size-3 rounded-full bg-[#f26b5b]" /><span className="size-3 rounded-full bg-[#ffc857]" /><span className="size-3 rounded-full bg-[#8cc0a0]" />
        <span className="ml-3 hidden rounded-md bg-surface px-3 py-1 text-[12px] text-muted sm:block">monitor / dashboard</span>
      </div>
      <div className="flex">
        {/* sidebar */}
        <aside className="hidden w-[150px] shrink-0 flex-col gap-1 bg-surface px-3 py-4 md:flex" aria-hidden>
          <span className="mb-4 ml-1 grid size-7 place-items-center rounded-full bg-black text-white"><Radar size={14} /></span>
          {SIDE.map((Icon, i) => (
            <span key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${i === 0 ? "bg-primary-soft text-[#2a3a8f]" : "text-ink-2"}`}>
              <Icon size={14} strokeWidth={1.5} />
              <span className={`h-1.5 rounded-full ${i === 0 ? "w-14 bg-[#2a3a8f]/50" : "w-12 bg-line"}`} />
            </span>
          ))}
        </aside>
        {/* main */}
        <div className="min-w-0 flex-1 bg-canvas p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[20px] text-ink sm:text-[22px]">Dashboard</span>
            <span className="rounded-[4px] bg-primary px-3 py-1.5 text-[12px] text-white">Create ▾</span>
          </div>
          <div className="rounded-sm bg-surface">
            <div className="flex items-end justify-between border-b border-line px-4 pt-3 text-[12px] sm:px-6">
              <div className="flex gap-6"><span className="border-b-2 border-[#2a3a8f] pb-2 text-[#2a3a8f]">Overview</span><span className="pb-2 text-ink">Incidents</span></div>
              <span className="pb-2 text-muted">last 6 months ▾</span>
            </div>
            <div className="grid md:grid-cols-2">
              <div className="border-line p-4 sm:p-6 md:border-r">
                <div className="mb-2 text-[13px] font-semibold">Incident pipeline</div>
                <div className="flex items-baseline gap-2"><span className="num text-[34px]">32</span><span className="text-[12px] text-ink-2">active incidents</span></div>
                <div className="mt-3 flex h-[5px]">{PIPE.map((p) => <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.c }} />)}</div>
                <ul className="mt-3 space-y-2 text-[12px]">
                  {PIPE.map((p) => (
                    <li key={p.label} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-[2px]" style={{ background: p.c }} />
                      <span className="flex-1 text-ink-2">{p.label}</span>
                      <span className="w-8 text-right tabular-nums text-ink-2">{p.n}</span>
                      <span className="w-16 text-right text-muted">{p.h}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="border-t border-line p-4 sm:p-6 md:border-t-0">
                <div className="mb-3 text-[13px] font-semibold">Report sources</div>
                <div className="flex items-center gap-5">
                  <Donut />
                  <ul className="flex-1 space-y-2 text-[12px]">
                    {SOURCES.map((s) => (
                      <li key={s.label} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-[2px]" style={{ background: s.c }} />
                        <span className="flex-1 text-ink-2">{s.label}</span>
                        <span className="text-muted">{s.v} %</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <div className="border-t border-line p-4 sm:p-6">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[13px] font-semibold">Incident tracking</span>
                <span className="flex gap-3 text-[11px] text-ink-2">
                  <span className="flex items-center gap-1"><i className="size-2 rounded-[2px] bg-teal" />Benue</span>
                  <span className="flex items-center gap-1"><i className="size-2 rounded-[2px] bg-crimson" />Plateau</span>
                </span>
              </div>
              <TrendMini />
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
