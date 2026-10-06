import { PageTitle, Panel } from "@/components/ui";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "How information flows",
    body: (
      <ol className="list-decimal space-y-2 pl-5">
        <li><b>Reports arrive</b> by community SMS, field agents, coordinate uploads, ACLED imports and satellite fire detections.</li>
        <li><b>Analysts verify</b> each report on the Incidents page and move it through Reported → Verified → Responded → Resolved → Closed, or dismiss false reports.</li>
        <li><b>Hotspots</b> are recalculated every hour; the <b>risk forecast</b> is rescored nightly and the model retrained monthly.</li>
        <li><b>Alert rules</b> run every 15 minutes and only create drafts. An analyst reviews, approves and sends each SMS alert.</li>
      </ol>
    ),
  },
  {
    title: "SMS commands for community members",
    body: (
      <table className="w-full text-left">
        <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2">
          <tr><td className="w-56 font-mono">REPORT &lt;what happened&gt;</td><td>Send a report. Mention the LGA name if possible (e.g. “REPORT Guma, houses burning near the river”). Hausa: <span className="font-mono">RAHOTO</span>.</td></tr>
          <tr><td className="font-mono">STOP</td><td>Stop receiving alerts. Hausa: <span className="font-mono">TSAYA</span> or <span className="font-mono">DAINA</span>.</td></tr>
          <tr><td className="font-mono">JOIN</td><td>Resume alerts after STOP.</td></tr>
        </tbody>
      </table>
    ),
  },
  {
    title: "Reading the risk forecast",
    body: (
      <p>
        Each ~36 km² hexagon gets a probability that at least one incident happens there in the next two weeks. Because incidents in any one
        hexagon are rare (about 0.5 % of hexagon-fortnights), a value of 5 % is already ten times the average. The forecast uses only past
        incident locations and timing, nearby incidents, satellite fires, rainfall, season and geography. It does not use ethnicity, religion or
        any group identity, and it should never be used to profile communities.
      </p>
    ),
  },
  {
    title: "Uploading coordinates",
    body: (
      <p>
        Uploads accept CSV, GeoJSON (Point features) and KML (Placemarks). Each row needs a latitude, longitude and date. Rows outside Benue and
        Plateau, with future dates or with unreadable values are rejected; rows within 500 m and 24 hours of an existing incident are flagged as
        possible duplicates. You see a preview before anything is saved.
      </p>
    ),
  },
  {
    title: "Data sources",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>ACLED (Armed Conflict Location &amp; Event Data): historical events, filtered to farmer–herder related violence.</li>
        <li>NASA FIRMS VIIRS: near-real-time active fire detections.</li>
        <li>Open-Meteo / ERA5: weekly rainfall per LGA.</li>
        <li>geoBoundaries (CC BY 4.0): state and LGA boundaries. OpenStreetMap: base map.</li>
      </ul>
    ),
  },
];

export default function HelpPage() {
  return (
    <>
      <PageTitle title="Help" />
      <div className="space-y-6">
        {SECTIONS.map((s) => (
          <Panel key={s.title} className="p-6 text-[15px] leading-relaxed text-ink-2">
            <h2 className="mb-3 text-[19px] font-semibold text-ink">{s.title}</h2>
            {s.body}
          </Panel>
        ))}
      </div>
    </>
  );
}
