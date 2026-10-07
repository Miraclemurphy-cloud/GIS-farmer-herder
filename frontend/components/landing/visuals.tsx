/** Decorative visuals for the landing page. Illustrative only — not real data. */

const HEX_W = 34;
const HEX_H = 30;

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
      const jitter = rand(c * 31 + r) * 0.12;
      cells.push({ cx, cy, heat: Math.min(1, heat + jitter), k: `${c}-${r}` });
    }
  }
  return (
    <svg viewBox="0 0 440 360" className="h-auto w-full" role="img" aria-label="Illustration of a hexagon map with three glowing hotspots">
      <defs>
        <filter id="hex-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {cells.map(({ cx, cy, heat, k }) => (
        <path key={k} d={hexPath(cx, cy, 16)}
          fill={heat > 0.55 ? "#d3fb52" : heat > 0.3 ? "#7af3ff" : "#ffffff"}
          fillOpacity={heat > 0.3 ? 0.25 + heat * 0.6 : 0.04 + heat * 0.1}
          stroke="#ffffff" strokeOpacity={0.08} />
      ))}
      {hot.map((h, i) => {
        const cx = 20 + h.c * HEX_W * 0.75 * 1.14;
        const cy = 20 + h.r * HEX_H + (h.c % 2 ? HEX_H / 2 : 0);
        return <circle key={i} cx={cx} cy={cy} r={18 + h.s * 6} fill="#d3fb52" opacity={0.35} filter="url(#hex-glow)" />;
      })}
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
      <div className="rounded-[44px] border border-[var(--l-white-20)] bg-[#0c0d12] p-3 shadow-[0_40px_100px_rgb(0_0_0/0.5)]">
        <div className="rounded-[34px] bg-[var(--l-paper)] px-4 pb-6 pt-5 text-[var(--l-ink)]">
          <div className="mx-auto mb-5 h-1.5 w-20 rounded-full bg-black/15" />
          <div className="mb-4 text-center">
            <div className="text-[13px] font-semibold">Community Alert</div>
            <div className="text-[11px] text-black/45">Text message · Today 18:42</div>
          </div>
          <div className="space-y-3">
            {SMS.map((m) => (
              <div key={m.lang}>
                <div className="mb-1 pl-1 text-[11px] font-medium text-black/45">{m.lang}</div>
                <div className="rounded-2xl rounded-tl-md bg-white p-3 text-[13.5px] leading-snug shadow-sm">{m.text}</div>
              </div>
            ))}
            <div className="ml-auto w-fit rounded-2xl rounded-tr-md bg-[var(--l-ink-2)] px-3 py-2 text-[13.5px] text-white">REPORT Guma: smoke near Yelwata</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareBars() {
  return (
    <div className="space-y-5 rounded-3xl border border-[var(--l-white-10)] bg-[var(--l-ink-3)] p-7" aria-hidden>
      <div className="text-[13px] font-medium uppercase tracking-wider text-[var(--l-white-60)]">Every model is checked against</div>
      {[
        { label: "A simple baseline: “where it happened before”", w: "62%", c: "bg-white/25" },
        { label: "The forecast: history + neighbours + fires + rainfall + season", w: "78%", c: "bg-[var(--l-lime)]" },
      ].map((b) => (
        <div key={b.label}>
          <div className="mb-2 text-[15px] text-white/85">{b.label}</div>
          <div className="h-3 rounded-full bg-white/5"><div className={`h-full rounded-full ${b.c}`} style={{ width: b.w }} /></div>
        </div>
      ))}
      <p className="text-[14px] leading-snug text-[var(--l-white-60)]">
        Tested on months it never saw. If it can&apos;t beat the baseline, it doesn&apos;t ship.
      </p>
    </div>
  );
}
