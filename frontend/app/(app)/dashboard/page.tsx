"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { CausesCard, type Dashboard, OtherDataCard, PipelineCard, SourcesCard } from "@/components/dashboard/cards";
import { TrendCard } from "@/components/dashboard/TrendCard";
import { LiveFeed } from "@/components/dashboard/LiveFeed";
import { MapView } from "@/components/MapView";
import { Badge, Dropdown, ErrorNote, Menu, PageTitle, Panel, RANGES, SectionTitle, Tabs } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { fmtDate, fmtInt, label } from "@/lib/format";

const STATES = [
  { value: "", label: "Benue & Plateau" },
  { value: "Benue", label: "Benue" },
  { value: "Plateau", label: "Plateau" },
];

export default function DashboardPage() {
  const router = useRouter();
  const { version } = useLive();
  const [tab, setTab] = useState<"overview" | "incidents">("overview");
  const [months, setMonths] = useState(6);
  const [state, setState] = useState("");
  const qs = `months=${months}${state ? `&state=${state}` : ""}`;
  const { data, error } = useApi<Dashboard>(`/api/analytics/dashboard?${qs}&v=${version}`);

  const since = useMemo(() => new Date(Date.now() - months * 30.44 * 864e5).toISOString(), [months]);
  const incidents = useApi<GeoJSON.FeatureCollection>(`/api/incidents/geojson?start=${since}${state ? `&state=${state}` : ""}&v=${version}`);
  const hotspots = useApi<GeoJSON.FeatureCollection>(`/api/geo/hotspots?kind=gi&v=${version}`);
  const boundaries = useApi<GeoJSON.FeatureCollection>("/api/geo/admin-areas?level=2");

  return (
    <>
      <PageTitle title="Dashboard">
        <Menu label="Create" items={[
          { label: "New incident", onClick: () => router.push("/incidents?new=1") },
          { label: "Upload coordinates", onClick: () => router.push("/uploads") },
          { label: "Draft alert", onClick: () => router.push("/alerts?new=1") },
        ]} />
      </PageTitle>

      {data?.synthetic_data && (
        <div className="mb-4 flex items-start gap-2 rounded-sm border border-[#ffe3a3] bg-[#fff8e6] px-4 py-3 text-sm text-[#7a5600]">
          <TriangleAlert size={18} className="mt-px shrink-0" />
          Demo mode: incidents shown are synthetic, generated because no ACLED credentials are configured.
          They are not real events. Add ACLED credentials and re-run the import to use recorded data.
        </div>
      )}
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 pt-6 sm:px-8">
          <Tabs value={tab} onChange={setTab} tabs={[{ value: "overview", label: "Overview" }, { value: "incidents", label: "Incidents" }]} />
          <div className="flex items-center gap-6 pb-3">
            <Dropdown value={state} onChange={setState} options={STATES} />
            <Dropdown value={months} onChange={setMonths} options={RANGES} icon />
          </div>
        </div>

        {tab === "overview" && data && (
          <>
            <div className="grid lg:grid-cols-2">
              <div className="border-line px-6 py-10 sm:px-12 lg:border-r"><PipelineCard d={data} /></div>
              <div className="border-t border-line px-6 py-10 sm:px-10 lg:border-t-0"><SourcesCard d={data} /></div>
            </div>
            <div className="mx-6 border-t border-line py-10 sm:mx-12"><TrendCard state={state} version={version} /></div>
            <div className="mx-6 grid border-t border-line sm:mx-12 lg:grid-cols-2">
              <div className="border-line py-10 lg:border-r lg:pr-12"><CausesCard d={data} /></div>
              <div className="border-t border-line py-10 lg:border-t-0 lg:pl-10"><OtherDataCard d={data} /></div>
            </div>
          </>
        )}
        {tab === "incidents" && <IncidentsTab qs={qs} version={version} />}
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between px-6 pb-4 pt-6">
            <h2 className="text-[19px] font-semibold">Live situation map</h2>
            <Link href="/map" className="text-sm text-primary hover:underline">Open full map</Link>
          </div>
          <MapView height={460} layers={{ boundaries: boundaries.data, hotspots: hotspots.data, incidents: incidents.data }}
            onSelect={(kind, p) => kind === "incidents" && router.push(`/incidents?id=${p.id}`)} />
          <div className="flex flex-wrap gap-4 px-6 py-3 text-xs text-ink-2">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#f26b5b]" />Reported</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#e0a526]" />Verified</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#3a3a5c]" />Responded</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#8e3e91]" />Resolved / closed</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 bg-[#b3182b]/50" />Hotspot (Gi*, 12 months)</span>
          </div>
        </Panel>
        <Panel className="p-6"><LiveFeed /></Panel>
      </div>
    </>
  );
}

type IncidentRow = {
  id: number; occurred_at: string; state: string; lga: string; location_name: string; type: string;
  fatalities: number; status: string; source: string;
};

function IncidentsTab({ qs, version }: { qs: string; version: number }) {
  const months = Number(new URLSearchParams(qs).get("months"));
  const state = new URLSearchParams(qs).get("state");
  const start = useMemo(() => new Date(Date.now() - months * 30.44 * 864e5).toISOString(), [months]);
  const list = useApi<{ total: number; items: IncidentRow[] }>(`/api/incidents?limit=12&start=${start}${state ? `&state=${state}` : ""}&v=${version}`);
  const lga = useApi<{ lga: string; state: string; incidents: number; fatalities: number }[]>(`/api/analytics/lga?${qs}&v=${version}`);
  const max = Math.max(1, ...(lga.data ?? []).map((r) => r.incidents));
  return (
    <div className="grid gap-10 px-6 py-10 sm:px-12 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <SectionTitle right={<Link href="/incidents" className="text-sm text-primary hover:underline">All incidents</Link>}>
          Latest incidents
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-muted">
              <tr><th className="pb-3 font-normal">Date</th><th className="font-normal">Location</th><th className="font-normal">Type</th>
                <th className="text-right font-normal">Deaths</th><th className="pl-4 font-normal">Status</th></tr>
            </thead>
            <tbody>
              {list.data?.items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="py-3 text-ink-2">{fmtDate(i.occurred_at)}</td>
                  <td><Link href={`/incidents?id=${i.id}`} className="hover:text-primary">{i.location_name || i.lga}</Link>
                    <span className="block text-xs text-muted">{i.state}</span></td>
                  <td className="text-ink-2">{label(i.type)}</td>
                  <td className="text-right tabular-nums">{i.fatalities}</td>
                  <td className="pl-4"><Badge tone={i.status === "reported" ? "red" : i.status === "verified" ? "amber" : "grey"}>{label(i.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <SectionTitle>Most affected LGAs</SectionTitle>
        <ul className="space-y-3">
          {lga.data?.map((r) => (
            <li key={r.lga} className="text-sm">
              <div className="mb-1 flex justify-between"><span>{r.lga} <span className="text-muted">· {r.state}</span></span>
                <span className="tabular-nums text-ink-2">{fmtInt(r.incidents)} <span className="text-muted">/ {fmtInt(r.fatalities)} deaths</span></span></div>
              <div className="h-1.5 bg-canvas"><div className="h-full" style={{ width: `${(r.incidents / max) * 100}%`, background: r.state === "Benue" ? "var(--teal)" : "var(--crimson)" }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
