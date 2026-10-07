"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Menu, Radar, X } from "lucide-react";
import { API_URL } from "@/lib/api";

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Benue–Plateau Monitor home">
      <span className={`grid size-9 place-items-center rounded-full ${inverted ? "bg-white text-black" : "bg-black text-white"}`}>
        <Radar size={20} strokeWidth={2} />
      </span>
      <span className={`text-[17px] font-semibold leading-tight tracking-tight ${inverted ? "text-white" : "text-ink"}`}>
        Benue–Plateau<br className="sm:hidden" /> Monitor
      </span>
    </Link>
  );
}

const NAV = [
  { href: "#preview", label: "Dashboard" },
  { href: "#how", label: "How it works" },
  { href: "#alerts", label: "Alerts" },
  { href: "#principles", label: "Principles" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 rounded-xl border border-line bg-surface/95 py-2 pl-3 pr-2 shadow-[0_6px_24px_rgb(31_35_48/0.08)] backdrop-blur">
        <Logo />
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="rounded-md px-3 py-2 text-[15px] text-ink-2 hover:bg-canvas hover:text-ink">{n.label}</a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a href="#join" className="hidden rounded-[4px] border border-line px-4 py-2.5 text-[15px] leading-none text-ink-2 hover:bg-canvas sm:inline-block">
            Get alerts
          </a>
          <Link href="/login" className="rounded-[4px] bg-primary px-4 py-2.5 text-[15px] leading-none text-white shadow-sm hover:brightness-110">
            Staff sign in
          </Link>
          <button onClick={() => setOpen(!open)} className="grid size-10 place-items-center rounded-md text-ink-2 hover:bg-canvas lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="mx-auto mt-2 max-w-[1240px] rounded-xl border border-line bg-surface p-2 shadow-xl lg:hidden">
          {[...NAV, { href: "#join", label: "Get alerts" }].map((n) => (
            <li key={n.href}>
              <a href={n.href} onClick={() => setOpen(false)} className="block rounded-md px-4 py-3 text-[17px] text-ink hover:bg-canvas">{n.label}</a>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

const MESSAGES = [
  "REPORT Guma: armed men seen near the farms by the river",
  "RAHOTO Bokkos: mutane dauke da makamai kusa da gonaki",
  "REPORT Agatu: cattle destroyed yam farms, youths gathering",
  "JOIN Makurdi",
];

/** A mock SMS composer that types example messages. */
export function Composer() {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useEffect(() => {
    if (reduced) return;
    const msg = MESSAGES[i];
    const t = setTimeout(() => {
      if (n < msg.length) setN(n + 1);
      else {
        setN(0);
        setI((i + 1) % MESSAGES.length);
      }
    }, n < msg.length ? 45 : 2200);
    return () => clearTimeout(t);
  }, [i, n, reduced]);
  const text = reduced ? MESSAGES[0] : MESSAGES[i].slice(0, n);

  return (
    <div className="mx-auto w-full max-w-[720px] rounded-2xl border border-line bg-surface p-5 text-left shadow-[0_24px_60px_rgb(31_35_48/0.10)] sm:p-7">
      <div className="mb-3 flex items-center justify-between text-[13px] text-muted">
        <span>New message · Community alert line</span>
        <span className="hidden sm:inline">SMS · no data needed</span>
      </div>
      <p className="min-h-[3.2em] text-[19px] leading-snug text-ink sm:text-[22px]" aria-live="off">
        {text}
        <span className="caret" aria-hidden />
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-[14px] text-ink-2">
          Text <b className="font-semibold text-ink">REPORT</b> + place + what you see. Hausa: <b className="font-semibold text-ink">RAHOTO</b>.
        </p>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-sm" aria-hidden>
          <ArrowUp size={22} />
        </span>
      </div>
    </div>
  );
}

/** Opts the page into scroll-reveal animations once JS is running. */
export function RevealController() {
  useEffect(() => {
    const root = document.querySelector(".landing");
    if (!root) return;
    root.classList.add("reveal-on");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }),
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}

type Summary = {
  incidents_12m: number; lgas_covered: number; subscribers: number; alerts_sent: number;
  forecast_top5_capture: number | null; synthetic_data: boolean;
};

function useCountUp(target: number | null, run: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target == null || !run) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(target);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1200);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return v;
}

const STAT_COLORS = ["var(--s1)", "var(--s2)", "var(--s4)", "var(--primary)"];

export function Stats() {
  const [s, setS] = useState<Summary | null>(null);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/public/summary`).then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null));
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const items = [
    { v: useCountUp(s?.lgas_covered ?? 40, seen), suffix: "", label: "local government areas covered across Benue and Plateau" },
    { v: useCountUp(s?.incidents_12m ?? null, seen), suffix: "", label: "incidents mapped and tracked in the last 12 months" },
    { v: useCountUp(s?.subscribers ?? null, seen), suffix: "", label: "community members subscribed to SMS alerts" },
    {
      v: useCountUp(s?.forecast_top5_capture != null ? Math.round(s.forecast_top5_capture * 100) : null, seen),
      suffix: "%", label: "of incidents fell in the 5 % of areas the forecast flagged highest risk",
    },
  ];

  return (
    <div ref={ref}>
      <div className="grid gap-px overflow-hidden rounded-sm bg-line sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, k) => (
          <div key={k} className="bg-surface p-7 sm:p-8">
            <span className="mb-5 block h-[6px] w-10" style={{ background: STAT_COLORS[k] }} />
            {s || k === 0 ? (
              <div className="num text-[56px] text-ink sm:text-[64px]">{`${it.v.toLocaleString("en-NG")}${it.suffix}`}</div>
            ) : (
              <div className="num text-[56px] text-line sm:text-[64px]" aria-label="not available">—</div>
            )}
            <p className="mt-3 max-w-[16rem] text-[15px] leading-snug text-ink-2">{it.label}</p>
          </div>
        ))}
      </div>
      {s?.synthetic_data && (
        <p className="mt-4 text-[14px] text-muted">
          Figures currently come from the system&apos;s demonstration dataset and will switch to recorded events once live data is connected.
        </p>
      )}
    </div>
  );
}
