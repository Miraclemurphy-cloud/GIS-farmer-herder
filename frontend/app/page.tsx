import type { Metadata } from "next";
import Link from "next/link";
import { Anton, Inter_Tight } from "next/font/google";
import { ArrowRight, BellRing, EyeOff, Flame, Lock, MessageSquareText, ScrollText, ShieldCheck, UserCheck } from "lucide-react";
import { Composer, Logo, Nav, RevealController, Stats } from "@/components/landing/interactive";
import { CompareBars, DashboardPreview, HexField, PhoneMock } from "@/components/landing/visuals";
import "@/components/landing/landing.css";

const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const grotesk = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "Benue–Plateau Monitor — early warning for every community",
  description:
    "Community SMS reporting, live hotspot mapping and human-approved early-warning alerts for farmer–herder conflict in Benue and Plateau states.",
};

const CHIPS = [
  { label: "SMS reports", c: "var(--s1)" },
  { label: "Hausa · Tiv · English", c: "var(--s2)" },
  { label: "40 LGAs", c: "var(--s4)" },
  { label: "Human-approved alerts", c: "var(--s5)" },
];
const PLACES = ["Guma", "Agatu", "Logo", "Bokkos", "Barkin Ladi", "Riyom", "Bassa", "Mangu", "Gwer West", "Kwande", "Wase", "Makurdi", "Apa", "Jos South"];

const STEPS = [
  { n: "01", icon: MessageSquareText, c: "var(--s1)", title: "Report", body: "Anyone can text REPORT with a place and what they see. Field agents add verified incidents and upload GPS coordinates." },
  { n: "02", icon: UserCheck, c: "var(--s2)", title: "Verify", body: "Analysts check every report against other sources and satellite fire detections before it counts." },
  { n: "03", icon: Flame, c: "var(--s4)", title: "Detect", body: "Hotspots are recalculated hourly and a two-week risk forecast is refreshed every night." },
  { n: "04", icon: BellRing, c: "var(--s5)", title: "Warn", body: "When risk rises, an analyst approves a short SMS that reaches everyone registered nearby, in their language." },
];

const PRINCIPLES = [
  { icon: EyeOff, title: "No identity data", body: "Forecasts use places, dates, satellite fires and rainfall. Never ethnicity, religion or group identity." },
  { icon: ShieldCheck, title: "A human approves every alert", body: "Rules only draft warnings. A trained analyst checks the facts and the wording before anything is sent." },
  { icon: Lock, title: "Numbers stay private", body: "Phone numbers are encrypted, shown masked, and erased on request. Reply STOP at any time." },
  { icon: ScrollText, title: "Every action is logged", body: "Sign-ins, status changes and alerts are audited, and detailed risk maps are visible to authorised staff only." },
];

const PREVIEW_POINTS = [
  { c: "var(--s1)", title: "Incident pipeline", body: "Every report from Reported to Closed, with how long each stage takes." },
  { c: "var(--s4)", title: "Where reports come from", body: "Community SMS, field agents, uploads and satellites, side by side." },
  { c: "var(--teal)", title: "Benue and Plateau trends", body: "Month-by-month incidents and fatalities for each state." },
];

export default function LandingPage() {
  return (
    <div className={`landing ${display.variable} ${grotesk.variable} min-h-screen overflow-x-hidden`}>
      <RevealController />
      <Nav />

      {/* Hero */}
      <section className="relative isolate flex flex-col items-center px-4 pb-16 pt-36 text-center sm:pt-44">
        <div className="glow -z-10" aria-hidden />
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] text-ink-2">
          <span className="size-2 rounded-full bg-[#2b9a5a]" /> Live across Benue and Plateau
        </span>
        <h1 className="display text-[clamp(52px,10vw,124px)] text-ink">
          Early warning<br />for <span className="text-primary">every community</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-[18px] leading-relaxed text-ink-2 sm:text-[20px]">
          Report incidents by text, see hotspots as they form, and warn villages before violence spreads.
        </p>
        <div className="mt-10 w-full"><Composer /></div>
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <li key={c.label} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[15px] text-ink-2">
              <span className="size-3 rounded-[3px]" style={{ background: c.c }} />{c.label}
            </li>
          ))}
        </ul>
      </section>

      {/* Dashboard preview */}
      <section id="preview" className="relative scroll-mt-28 px-4 pb-24 sm:pb-32">
        <div className="mx-auto max-w-[1240px]">
          <div data-reveal><DashboardPreview /></div>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {PREVIEW_POINTS.map((p) => (
              <div key={p.title} data-reveal>
                <span className="mb-4 block h-[6px] w-10" style={{ background: p.c }} />
                <h3 className="text-[19px] font-semibold">{p.title}</h3>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-[13px] text-muted">Preview with illustrative figures. The live dashboard is available to authorised staff.</p>
        </div>
      </section>

      {/* Coverage marquee */}
      <section aria-label="Areas covered" className="border-y border-line bg-surface py-6">
        <p className="mb-3 text-center text-[14px] text-muted">Monitoring communities across</p>
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <div className="marquee gap-12 pr-12">
            {[...PLACES, ...PLACES].map((p, i) => (
              <span key={i} className="display text-[32px] text-ink/25" aria-hidden={i >= PLACES.length}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-[1240px] px-4 py-24 sm:py-32">
        <div data-reveal className="mb-12 max-w-[760px]">
          <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">Built for the places where warnings arrive too late.</h2>
          <p className="mt-5 text-[18px] leading-relaxed text-ink-2">
            Attacks in the farming belt often unfold over hours in places without internet or news coverage. One shared picture lets
            communities, responders and analysts act on the same facts.
          </p>
        </div>
        <div data-reveal><Stats /></div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-28 px-4 pb-24 sm:pb-32">
        <h2 data-reveal className="display mb-12 text-[clamp(44px,6.5vw,84px)]">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, icon: Icon, c, title, body }) => (
            <li key={n} data-reveal className="flex flex-col rounded-sm bg-surface p-7">
              <div className="mb-10 flex items-center justify-between">
                <span className="num text-[44px] text-ink">{n}</span>
                <span className="grid size-10 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${c} 18%, white)`, color: c }}>
                  <Icon size={18} strokeWidth={2} />
                </span>
              </div>
              <h3 className="text-[21px] font-semibold tracking-tight">{title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Feature: alerts */}
      <section id="alerts" className="scroll-mt-28 bg-surface px-4 py-24 sm:py-32">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2">
          <div data-reveal>
            <p className="mb-4 text-[15px] font-semibold text-primary">SMS alerts</p>
            <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">Warnings that reach any phone, in the language people speak.</h2>
            <p className="mt-5 text-[18px] leading-relaxed text-ink-2">
              No app, no data bundle, no smartphone. Alerts go out in English and Hausa, with Tiv added as community translators review
              it. Messages name an area and a safe action, never exact locations that could put people at risk.
            </p>
            <ul className="mt-8 space-y-3 text-[16px]">
              {["Targeted by distance, so only nearby villages are woken at night", "Text STOP to leave and JOIN to come back", "Delivery tracked for every message"].map((t) => (
                <li key={t} className="flex gap-3"><ArrowRight size={20} className="mt-0.5 shrink-0 text-primary" />{t}</li>
              ))}
            </ul>
          </div>
          <div data-reveal><PhoneMock /></div>
        </div>
      </section>

      {/* Feature: forecasts */}
      <section id="forecasts" className="mx-auto grid max-w-[1240px] scroll-mt-28 items-center gap-14 px-4 py-24 sm:py-32 lg:grid-cols-2">
        <div data-reveal className="order-2 space-y-4 lg:order-1">
          <div className="rounded-sm bg-surface p-5"><HexField /></div>
          <CompareBars />
        </div>
        <div data-reveal className="order-1 lg:order-2">
          <p className="mb-4 text-[15px] font-semibold text-teal">Hotspots & forecasts</p>
          <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">See where tension is building, not just where it broke out.</h2>
          <p className="mt-5 text-[18px] leading-relaxed text-ink-2">
            Every report becomes a point on a shared map of roughly 36 km² hexagons. Statistical hotspot tests show where incidents cluster
            beyond chance, and a forecast learned from past events, nearby activity, satellite-detected fires and rainfall ranks the areas
            most likely to see violence in the next two weeks.
          </p>
          <p className="mt-4 text-[18px] leading-relaxed text-ink-2">
            Coordinates can be uploaded in bulk from CSV, GeoJSON or KML, checked against state boundaries and screened for duplicates before
            they are saved.
          </p>
        </div>
      </section>

      {/* Principles */}
      <section id="principles" className="scroll-mt-28 bg-surface px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <h2 data-reveal className="display max-w-[900px] text-[clamp(44px,6.5vw,92px)]">Built to protect,<br /><span className="text-crimson">not to profile</span></h2>
          <p data-reveal className="mt-6 max-w-[640px] text-[18px] leading-relaxed text-ink-2">
            Early-warning data can do harm in the wrong hands. These rules are enforced by the software, not just written in a policy.
          </p>
          <div className="mt-14 grid gap-px overflow-hidden rounded-sm bg-line sm:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <div key={title} data-reveal className="bg-surface p-8">
                <span className="mb-8 grid size-11 place-items-center rounded-md bg-primary-soft text-[#2a3a8f]"><Icon size={20} /></span>
                <h3 className="text-[21px] font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join */}
      <section id="join" className="scroll-mt-28 px-4 py-16 sm:py-24">
        <div className="relative isolate mx-auto max-w-[1240px] overflow-hidden rounded-xl bg-primary px-6 py-20 text-center text-white sm:py-28">
          <div className="glow on-primary -z-10" aria-hidden />
          <h2 data-reveal className="display text-[clamp(48px,8vw,108px)]">Join the alert network</h2>
          <p data-reveal className="mx-auto mt-6 max-w-[620px] text-[18px] leading-relaxed text-white/85">
            Ask your community coordinator or a partner organisation to register your number, or text <b className="text-white">JOIN</b> and
            your LGA to the community alert line. Responders and NGOs can request staff access to the dashboard.
          </p>
          <div data-reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <a href="#how" className="rounded-[4px] bg-white px-6 py-4 text-[17px] font-medium leading-none text-primary hover:bg-white/90">
              How reporting works
            </a>
            <Link href="/login" className="rounded-[4px] border border-white/50 px-6 py-4 text-[17px] font-medium leading-none text-white hover:bg-white/10">
              Staff sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-surface px-4 pb-10 pt-16">
        <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-6 max-w-[380px] text-[24px] leading-[1.2] tracking-[-0.02em] text-ink">Early warning for farmer–herder conflict in Benue and Plateau.</p>
          </div>
          <div>
            <h3 className="mb-4 text-[14px] font-semibold text-muted">Platform</h3>
            <ul className="space-y-3 text-[15px] text-ink-2">
              <li><a href="#preview" className="hover:text-primary">Dashboard</a></li>
              <li><a href="#how" className="hover:text-primary">How it works</a></li>
              <li><a href="#alerts" className="hover:text-primary">SMS alerts</a></li>
              <li><Link href="/login" className="hover:text-primary">Staff sign in</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-[14px] font-semibold text-muted">Data sources</h3>
            <ul className="space-y-3 text-[15px] text-ink-2">
              <li>ACLED conflict events</li>
              <li>NASA FIRMS active fires</li>
              <li>Open-Meteo rainfall</li>
              <li>geoBoundaries · OpenStreetMap</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-16 flex max-w-[1240px] flex-wrap justify-between gap-4 border-t border-line pt-6 text-[13px] text-muted">
          <span>In an emergency, contact local security services first.</span>
          <span>Map data © OpenStreetMap contributors</span>
        </div>
      </footer>
    </div>
  );
}
