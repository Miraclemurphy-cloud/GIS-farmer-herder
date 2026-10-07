"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Menu, Radar, X } from "lucide-react";
import { API_URL } from "@/lib/api";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Benue–Plateau Monitor home">
      <span className="grid size-10 place-items-center rounded-lg bg-[var(--l-lime)] text-[var(--l-ink)]">
        <Radar size={22} strokeWidth={2.4} />
      </span>
      <span className={`text-[17px] font-semibold leading-tight tracking-tight ${dark ? "text-[var(--l-ink)]" : "text-white"}`}>
        Benue–Plateau<br className="sm:hidden" /> Monitor
      </span>
    </Link>
  );
}

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#alerts", label: "Alerts" },
  { href: "#forecasts", label: "Forecasts" },
  { href: "#principles", label: "Principles" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 rounded-2xl bg-white py-2 pl-3 pr-2 text-[var(--l-ink)] shadow-[0_8px_30px_rgb(0_0_0/0.18)]">
        <Logo dark />
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} className="rounded-lg px-3 py-2 text-[15px] font-medium text-[var(--l-ink-2)] hover:bg-black/5">{n.label}</a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <a href="#join" className="hidden rounded-lg border border-[var(--l-ink-2)] px-4 py-2.5 text-[15px] font-medium leading-none hover:bg-black/5 sm:inline-block">
            Get alerts
          </a>
          <Link href="/login" className="rounded-lg bg-[var(--l-ink-2)] px-4 py-2.5 text-[15px] font-medium leading-none text-white hover:bg-black">
            Staff sign in
          </Link>
          <button onClick={() => setOpen(!open)} className="grid size-10 place-items-center rounded-lg hover:bg-black/5 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>
      {open && (
        <ul className="mx-auto mt-2 max-w-[1240px] rounded-2xl bg-white p-2 text-[var(--l-ink)] shadow-xl lg:hidden">
          {[...NAV, { href: "#join", label: "Get alerts" }].map((n) => (
            <li key={n.href}>
              <a href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-[17px] font-medium hover:bg-black/5">{n.label}</a>
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

/** A mock SMS composer that types example messages, echoing the reference's search box. */
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
    <div className="mx-auto w-full max-w-[760px] rounded-3xl bg-white p-5 text-left text-[var(--l-ink)] shadow-[0_30px_80px_rgb(0_0_0/0.35)] sm:p-7">
      <div className="mb-3 flex items-center justify-between text-[13px] font-medium text-black/45">
        <span>New message · Community alert line</span>
        <span className="hidden sm:inline">SMS · no data needed</span>
      </div>
      <p className="min-h-[3.2em] text-[19px] leading-snug sm:text-[22px]" aria-live="off">
        {text}
        <span className="caret" aria-hidden />
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <p className="text-[14px] text-black/50">Text <b className="font-semibold text-black/70">REPORT</b> + place + what you see. Hausa: <b className="font-semibold text-black/70">RAHOTO</b>.</p>
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--l-lime)]" aria-hidden>
          <ArrowUp size={24} />
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
      suffix: "%", label: "of incidents fell in the 5 % of areas our forecast flagged highest risk",
    },
  ];

  return (
    <div ref={ref}>
      <div className="grid gap-px overflow-hidden rounded-3xl bg-[var(--l-white-10)] sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, k) => (
          <div key={k} className="bg-[var(--l-ink)] p-7 sm:p-8">
            {s || k === 0 ? (
              <div className="display text-[72px] text-[var(--l-lime)] sm:text-[88px]">{`${it.v.toLocaleString("en-NG")}${it.suffix}`}</div>
            ) : (
              <div className="display text-[72px] text-white/15 sm:text-[88px]" aria-label="not available">—</div>
            )}
            <p className="mt-4 max-w-[16rem] text-[16px] leading-snug text-[var(--l-white-60)]">{it.label}</p>
          </div>
        ))}
      </div>
      {s?.synthetic_data && (
        <p className="mt-4 text-[14px] text-[var(--l-white-60)]">
          Figures currently come from the system&apos;s demonstration dataset and will switch to recorded events once live data is connected.
        </p>
      )}
    </div>
  );
}
