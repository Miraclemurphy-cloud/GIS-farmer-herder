"use client";
import Link from "next/link";
import { Bell, Flame, ShieldAlert, Upload } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useLive } from "@/lib/live";
import { label, timeAgo } from "@/lib/format";

type Row = { id: number; occurred_at: string; created_at: string; location_name: string; state: string; type: string; status: string; source: string };

/** Recent reports from the API, with live SSE events prepended as they arrive. */
export function LiveFeed() {
  const { events, connected, version } = useLive();
  const recent = useApi<{ items: Row[] }>(`/api/incidents?limit=8&v=${version}`);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[19px] font-semibold">Live feed</h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className={`size-2 rounded-full ${connected ? "bg-[#2b9a5a]" : "bg-muted"}`} />
          {connected ? "connected" : "offline"}
        </span>
      </div>
      <ul className="space-y-4">
        {events.filter((e) => e.kind !== "incident").slice(0, 5).map((e, i) => (
          <li key={`e${i}`} className="flex gap-3 text-sm">
            <EventIcon kind={e.kind} />
            <div>
              <div>{describe(e.kind, e.data)}</div>
              <div className="text-xs text-muted">{timeAgo(e.at)}</div>
            </div>
          </li>
        ))}
        {recent.data?.items.map((r) => (
          <li key={r.id} className="flex gap-3 text-sm">
            <EventIcon kind="incident" />
            <div>
              <Link href={`/incidents?id=${r.id}`} className="hover:text-primary">
                {label(r.type)} — {r.location_name || r.state}
              </Link>
              <div className="text-xs text-muted">
                {label(r.status)} · via {label(r.source)} · {timeAgo(r.occurred_at)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventIcon({ kind }: { kind: string }) {
  const cls = "mt-0.5 size-7 shrink-0 rounded-full grid place-items-center";
  if (kind.startsWith("alert")) return <span className={`${cls} bg-primary-soft text-primary`}><Bell size={14} /></span>;
  if (kind === "upload_committed") return <span className={`${cls} bg-canvas text-ink-2`}><Upload size={14} /></span>;
  if (kind === "hotspots" || kind === "risk_scored") return <span className={`${cls} bg-[#fff5dc] text-[#8a6100]`}><Flame size={14} /></span>;
  return <span className={`${cls} bg-[#fdecee] text-crimson`}><ShieldAlert size={14} /></span>;
}

function describe(kind: string, d: Record<string, unknown>) {
  switch (kind) {
    case "alert_draft": return `New alert draft: ${d.title}`;
    case "alert_sent": return `Alert #${d.id} sent to ${d.sent} subscribers`;
    case "upload_committed": return `${d.rows} incidents imported from upload`;
    case "hotspots": return `Hotspots updated: ${d.clusters} clusters, ${d.gi_cells} significant cells`;
    case "risk_scored": return "Weekly risk forecast refreshed";
    case "incident_status": return `Incident #${d.id} marked ${d.status}`;
    default: return label(kind);
  }
}
