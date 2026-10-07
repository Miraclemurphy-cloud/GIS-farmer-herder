import type { Metadata } from "next";
import Link from "next/link";
import { Anton, Inter_Tight } from "next/font/google";
import { ArrowRight, BellRing, EyeOff, Flame, Lock, MessageSquareText, ScrollText, ShieldCheck, UserCheck } from "lucide-react";
import { Composer, Logo, Nav, RevealController, Stats } from "@/components/landing/interactive";
import { CompareBars, HexField, PhoneMock } from "@/components/landing/visuals";
import "@/components/landing/landing.css";

const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const grotesk = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-grotesk" });

export const metadata: Metadata = {
  title: "Benue–Plateau Monitor — early warning for every community",
  description:
    "Community SMS reporting, live hotspot mapping and human-approved early-warning alerts for farmer–herder conflict in Benue and Plateau states.",
};

const CHIPS = ["SMS reports", "Hausa · Tiv · English", "40 LGAs", "Human-approved alerts"];
const PLACES = ["Guma", "Agatu", "Logo", "Bokkos", "Barkin Ladi", "Riyom", "Bassa", "Mangu", "Gwer West", "Kwande", "Wase", "Makurdi", "Apa", "Jos South"];

const STEPS = [
  { n: "01", icon: MessageSquareText, title: "Report", body: "Anyone can text REPORT with a place and what they see. Field agents add verified incidents and upload GPS coordinates." },
  { n: "02", icon: UserCheck, title: "Verify", body: "Analysts check every report against other sources and satellite fire detections before it counts." },
  { n: "03", icon: Flame, title: "Detect", body: "Hotspots are recalculated hourly and a two-week risk forecast is refreshed every night." },
  { n: "04", icon: BellRing, title: "Warn", body: "When risk rises, an analyst approves a short SMS that reaches everyone registered nearby, in their language." },
];

const PRINCIPLES = [
  { icon: EyeOff, title: "No identity data", body: "Forecasts use places, dates, satellite fires and rainfall. Never ethnicity, religion or group identity." },
  { icon: ShieldCheck, title: "A human approves every alert", body: "Rules only draft warnings. A trained analyst checks the facts and the wording before anything is sent." },
  { icon: Lock, title: "Numbers stay private", body: "Phone numbers are encrypted, shown masked, and erased on request. Reply STOP at any time." },
  { icon: ScrollText, title: "Every action is logged", body: "Sign-ins, status changes and alerts are audited, and detailed risk maps are visible to authorised staff only." },
];

export default function LandingPage() {
  return (
    <div className={`landing ${display.variable} ${grotesk.variable} min-h-screen overflow-x-hidden`}>
      <RevealController />
      <Nav />

      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col items-center justify-center px-4 pb-20 pt-32 text-center">
        <div className="glow -z-10" aria-hidden />
        <div className="vignette -z-10" aria-hidden />
        <h1 className="display text-[clamp(56px,11vw,132px)] text-white">
          Early warning<br />for every community
        </h1>
        <p className="mx-auto mt-6 max-w-[620px] text-[18px] leading-relaxed text-white/80 sm:text-[20px]">
          Report incidents by text, see hotspots as they form, and warn villages across Benue and Plateau before violence spreads.
        </p>
        <div className="mt-10 w-full"><Composer /></div>
        <ul className="mt-8 flex flex-wrap justify-center gap-2">
          {CHIPS.map((c) => (
            <li key={c} className="rounded-lg border border-[var(--l-white-20)] bg-white/5 px-4 py-2 text-[15px] font-medium text-white backdrop-blur-sm">{c}</li>
          ))}
        </ul>
      </section>

      {/* Coverage marquee */}
      <section aria-label="Areas covered" className="border-y border-[var(--l-white-10)] py-6">
        <p className="mb-4 text-center text-[15px] font-medium text-white/80">Monitoring communities across</p>
        <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
          <div className="marquee gap-12 pr-12">
            {[...PLACES, ...PLACES].map((p, i) => (
              <span key={i} className="display text-[34px] text-white/35" aria-hidden={i >= PLACES.length}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-[1240px] px-4 py-24 sm:py-32">
        <div data-reveal className="mb-12 max-w-[760px]">
          <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">
            Built for the places where warnings arrive too late.
          </h2>
          <p className="mt-5 text-[18px] leading-relaxed text-[var(--l-white-60)]">
            Attacks in the farming belt often unfold over hours in places without internet or news coverage. One shared picture lets
            communities, responders and analysts act on the same facts.
          </p>
        </div>
        <div data-reveal><Stats /></div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1240px] scroll-mt-28 px-4 pb-24 sm:pb-32">
        <h2 data-reveal className="display mb-12 text-[clamp(48px,7vw,88px)]">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <li key={n} data-reveal className="flex flex-col rounded-3xl border border-[var(--l-white-10)] bg-[var(--l-ink-3)] p-7">
              <div className="mb-10 flex items-center justify-between">
                <span className="display text-[40px] text-[var(--l-lime)]">{n}</span>
                <Icon size={26} strokeWidth={1.6} className="text-white/60" />
              </div>
              <h3 className="text-[24px] font-medium tracking-tight">{title}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-[var(--l-white-60)]">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Feature: alerts */}
      <section id="alerts" className="mx-auto grid max-w-[1240px] scroll-mt-28 items-center gap-14 px-4 pb-24 sm:pb-32 lg:grid-cols-2">
        <div data-reveal>
          <p className="mb-4 text-[15px] font-medium text-[var(--l-cyan)]">SMS alerts</p>
          <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">Warnings that reach any phone, in the language people speak.</h2>
          <p className="mt-5 text-[18px] leading-relaxed text-[var(--l-white-60)]">
            No app, no data bundle, no smartphone. Alerts go out in English and Hausa, with Tiv added as community translators review
            it. Messages name an area and a safe action, never exact locations that could put people at risk.
          </p>
          <ul className="mt-8 space-y-3 text-[16px]">
            {["Targeted by distance, so only nearby villages are woken at night", "Text STOP to leave and JOIN to come back", "Delivery tracked for every message"].map((t) => (
              <li key={t} className="flex gap-3"><ArrowRight size={20} className="mt-0.5 shrink-0 text-[var(--l-lime)]" />{t}</li>
            ))}
          </ul>
        </div>
        <div data-reveal><PhoneMock /></div>
      </section>

      {/* Feature: forecasts */}
      <section id="forecasts" className="mx-auto grid max-w-[1240px] scroll-mt-28 items-center gap-14 px-4 pb-24 sm:pb-32 lg:grid-cols-2">
        <div data-reveal className="order-2 space-y-6 lg:order-1">
          <div className="rounded-3xl border border-[var(--l-white-10)] bg-[var(--l-ink-3)] p-4"><HexField /></div>
          <CompareBars />
        </div>
        <div data-reveal className="order-1 lg:order-2">
          <p className="mb-4 text-[15px] font-medium text-[var(--l-cyan)]">Hotspots & forecasts</p>
          <h2 className="text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">See where tension is building, not just where it broke out.</h2>
          <p className="mt-5 text-[18px] leading-relaxed text-[var(--l-white-60)]">
            Every report becomes a point on a shared map of roughly 36 km² hexagons. Statistical hotspot tests show where incidents cluster
            beyond chance, and a forecast learned from past events, nearby activity, satellite-detected fires and rainfall ranks the areas
            most likely to see violence in the next two weeks.
          </p>
          <p className="mt-4 text-[18px] leading-relaxed text-[var(--l-white-60)]">
            Coordinates can be uploaded in bulk from CSV, GeoJSON or KML, checked against state boundaries and screened for duplicates before
            they are saved.
          </p>
        </div>
      </section>

      {/* Principles (light panel) */}
      <section id="principles" className="scroll-mt-28 rounded-t-3xl bg-[var(--l-paper)] px-4 py-24 text-[var(--l-ink)] sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <h2 data-reveal className="display max-w-[900px] text-[clamp(48px,7vw,96px)]">Built to protect,<br />not to profile</h2>
          <p data-reveal className="mt-6 max-w-[640px] text-[18px] leading-relaxed text-black/60">
            Early-warning data can do harm in the wrong hands. These rules are enforced by the software, not just written in a policy.
          </p>
          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <div key={title} data-reveal className="rounded-3xl bg-white p-8 shadow-[0_1px_0_rgb(0_0_0/0.04)]">
                <span className="mb-8 grid size-12 place-items-center rounded-xl bg-[var(--l-lime)]"><Icon size={22} /></span>
                <h3 className="text-[24px] font-medium tracking-tight">{title}</h3>
                <p className="mt-3 text-[16px] leading-relaxed text-black/60">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join */}
      <section id="join" className="relative isolate scroll-mt-28 overflow-hidden bg-[var(--l-paper)]">
        <div className="relative isolate overflow-hidden rounded-t-3xl bg-[var(--l-ink)] px-4 py-28 text-center sm:py-36">
          <div className="glow -z-10" aria-hidden />
          <div className="vignette -z-10" aria-hidden />
          <h2 data-reveal className="display text-[clamp(52px,9vw,120px)]">Join the alert network</h2>
          <p data-reveal className="mx-auto mt-6 max-w-[620px] text-[18px] leading-relaxed text-white/80">
            Ask your community coordinator or a partner organisation to register your number, or text <b className="text-white">JOIN</b> and
            your LGA to the community alert line. Responders and NGOs can request staff access to the dashboard.
          </p>
          <div data-reveal className="mt-10 flex flex-wrap justify-center gap-3">
            <a href="#how" className="rounded-lg bg-[var(--l-lime)] px-6 py-4 text-[18px] font-medium leading-none text-[var(--l-ink)] hover:brightness-95">
              How reporting works
            </a>
            <Link href="/login" className="rounded-lg border border-white/40 px-6 py-4 text-[18px] font-medium leading-none text-white hover:bg-white/10">
              Staff sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--l-white-10)] px-4 pb-10 pt-16">
        <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-6 max-w-[380px] text-[28px] leading-[1.15] tracking-[-0.025em]">Early warning for farmer–herder conflict in Benue and Plateau.</p>
          </div>
          <div>
            <h3 className="mb-4 text-[14px] font-medium text-[var(--l-white-60)]">Platform</h3>
            <ul className="space-y-3 text-[15px]">
              <li><a href="#how" className="hover:text-[var(--l-lime)]">How it works</a></li>
              <li><a href="#alerts" className="hover:text-[var(--l-lime)]">SMS alerts</a></li>
              <li><a href="#forecasts" className="hover:text-[var(--l-lime)]">Hotspots & forecasts</a></li>
              <li><Link href="/login" className="hover:text-[var(--l-lime)]">Staff sign in</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mb-4 text-[14px] font-medium text-[var(--l-white-60)]">Data sources</h3>
            <ul className="space-y-3 text-[15px] text-white/85">
              <li>ACLED conflict events</li>
              <li>NASA FIRMS active fires</li>
              <li>Open-Meteo rainfall</li>
              <li>geoBoundaries · OpenStreetMap</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-16 flex max-w-[1240px] flex-wrap justify-between gap-4 border-t border-[var(--l-white-10)] pt-6 text-[13px] text-[var(--l-white-60)]">
          <span>In an emergency, contact local security services first.</span>
          <span>Map data © OpenStreetMap contributors</span>
        </div>
      </footer>
    </div>
  );
}
