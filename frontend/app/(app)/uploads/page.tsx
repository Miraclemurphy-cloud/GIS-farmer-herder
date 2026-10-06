"use client";
import { useRef, useState } from "react";
import clsx from "clsx";
import { FileUp } from "lucide-react";
import { MapView } from "@/components/MapView";
import { Badge, Button, Empty, ErrorNote, PageTitle, Panel, SectionTitle } from "@/components/ui";
import { api, post } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime, label } from "@/lib/format";

type Row = {
  row: number; lat?: number; lon?: number; occurred_at?: string; type?: string; fatalities?: number;
  location_name?: string | null; state?: string; lga?: string; valid: boolean; errors: string[]; duplicate_of?: number | null;
};
type Upload = {
  id: number; filename: string; format: string; rows_total: number; rows_valid: number; rows_committed: number;
  committed: boolean; created_at: string; duplicates: number; rows?: Row[];
};

const TEMPLATE = "latitude,longitude,date,type,fatalities,injured,displaced,location,notes\n7.7412,8.5530,2025-06-14,attack,3,2,40,Example village,Describe what happened\n";

export default function UploadsPage() {
  const [current, setCurrent] = useState<Upload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [includeDupes, setIncludeDupes] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const history = useApi<Upload[]>("/api/uploads");

  async function send(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setCurrent(await api<Upload>("/api/uploads", { method: "POST", body: fd }));
      history.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!current) return;
    setBusy(true);
    try {
      const u = await post<Upload>(`/api/uploads/${current.id}/commit`, { include_duplicates: includeDupes });
      setCurrent({ ...current, ...u });
      history.reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const valid = current?.rows?.filter((r) => r.valid) ?? [];
  const toImport = valid.filter((r) => includeDupes || !r.duplicate_of).length;
  const pins: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: valid.map((r) => ({ type: "Feature", geometry: { type: "Point", coordinates: [r.lon!, r.lat!] },
      properties: { status: r.duplicate_of ? "verified" : "reported", fatalities: r.fatalities ?? 0 } })),
  };

  return (
    <>
      <PageTitle title="Uploads">
        <a className="text-sm text-primary hover:underline" download="incident-template.csv"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}>Download CSV template</a>
      </PageTitle>

      <Panel className="mb-6 p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) send(f); }}
          onClick={() => input.current?.click()}
          className={clsx("grid cursor-pointer place-items-center rounded-sm border-2 border-dashed px-6 py-12 text-center transition-colors",
            drag ? "border-primary bg-primary-soft" : "border-line hover:bg-canvas")}
        >
          <FileUp size={28} className="mb-3 text-muted" />
          <p className="text-ink">{busy ? "Processing…" : "Drop a CSV, GeoJSON or KML file here, or click to choose"}</p>
          <p className="mt-1 text-sm text-muted">Needs latitude, longitude and date per incident. Max 10 000 rows / 5 MB. Nothing is saved until you confirm.</p>
          <input ref={input} type="file" accept=".csv,.geojson,.json,.kml" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = ""; }} />
        </div>
        {err && <div className="mt-4"><ErrorNote>{err}</ErrorNote></div>}
      </Panel>

      {current?.rows && (
        <Panel className="mb-6 p-6">
          <SectionTitle right={current.committed
            ? <Badge tone="green">{current.rows_committed} incidents imported</Badge>
            : <div className="flex items-center gap-4">
                {current.duplicates > 0 && (
                  <label className="flex items-center gap-2 text-sm text-ink-2">
                    <input type="checkbox" checked={includeDupes} onChange={(e) => setIncludeDupes(e.target.checked)} className="accent-[var(--primary)]" />
                    also import possible duplicates
                  </label>
                )}
                <Button onClick={commit} disabled={busy || !toImport}>Import {toImport} incidents</Button>
              </div>}
          >
            {current.filename}
          </SectionTitle>
          <div className="mb-4 flex flex-wrap gap-6 text-sm text-ink-2">
            <span>{current.rows_total} rows</span>
            <span className="text-[#2b6b45]">{current.rows_valid} valid</span>
            <span className="text-crimson">{current.rows_total - current.rows_valid} with errors</span>
            <span className="text-[#8a6100]">{current.duplicates} possible duplicates (within 500 m and 24 h of an existing incident)</span>
          </div>
          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-surface text-left text-muted"><tr>
                  <th className="pb-2 font-normal">Row</th><th className="font-normal">Date</th><th className="font-normal">Coordinates</th>
                  <th className="font-normal">Place</th><th className="font-normal">Type</th><th className="font-normal">Check</th>
                </tr></thead>
                <tbody>
                  {current.rows.map((r) => (
                    <tr key={r.row} className={clsx("border-t border-line", !r.valid && "bg-[#fdf2f3]")}>
                      <td className="py-2 text-muted">{r.row}</td>
                      <td>{r.occurred_at ? fmtDate(r.occurred_at) : "—"}</td>
                      <td className="font-mono text-xs">{r.lat != null ? `${r.lat.toFixed(4)}, ${r.lon?.toFixed(4)}` : "—"}</td>
                      <td>{r.location_name || r.lga || "—"}<span className="block text-xs text-muted">{r.state}</span></td>
                      <td>{label(r.type)}</td>
                      <td>
                        {!r.valid ? <span className="text-xs text-crimson">{r.errors.join("; ")}</span>
                          : r.duplicate_of ? <Badge tone="amber">duplicate of #{r.duplicate_of}?</Badge>
                          : <Badge tone="green">ok</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-hidden rounded-sm border border-line"><MapView height={480} layers={{ incidents: pins }} /></div>
          </div>
        </Panel>
      )}

      <Panel className="p-6">
        <SectionTitle>Upload history</SectionTitle>
        {history.data && !history.data.length && <Empty>No uploads yet.</Empty>}
        <table className="w-full text-sm">
          <tbody>
            {history.data?.map((u) => (
              <tr key={u.id} className="cursor-pointer border-t border-line hover:bg-canvas"
                onClick={async () => setCurrent(await api<Upload>(`/api/uploads/${u.id}`))}>
                <td className="py-3">{u.filename}<span className="ml-2 text-xs uppercase text-muted">{u.format}</span></td>
                <td className="text-ink-2">{fmtDateTime(u.created_at)}</td>
                <td className="text-ink-2">{u.rows_valid}/{u.rows_total} valid</td>
                <td className="text-right">{u.committed ? <Badge tone="green">{u.rows_committed} imported</Badge> : <Badge>not imported</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
