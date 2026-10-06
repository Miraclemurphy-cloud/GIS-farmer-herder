"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";

type FC = GeoJSON.FeatureCollection;
export type Layers = {
  boundaries?: FC | null;
  risk?: FC | null;
  hotspots?: FC | null;
  incidents?: FC | null;
  fires?: FC | null;
  subscribers?: FC | null;
  circle?: { lat: number; lon: number; radiusKm: number } | null;
};

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#f2f2f0" } },
    { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.7, "raster-opacity": 0.85 } },
  ],
};
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
const EMPTY: FC = { type: "FeatureCollection", features: [] };
// Benue + Plateau extent
const BOUNDS: [[number, number], [number, number]] = [[7.0, 6.4], [10.1, 10.4]];

function circlePolygon(lat: number, lon: number, km: number): FC {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [pts] }, properties: {} }] };
}

export function MapView({ layers, height = 520, onSelect, onMapClick, className }: {
  layers: Layers;
  height?: number | string;
  onSelect?: (kind: string, props: Record<string, unknown>, lngLat: { lat: number; lng: number }) => void;
  /** Any click on the map (used for picking a location). */
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: STYLE, bounds: BOUNDS, fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("click", (e) => onMapClickRef.current?.(e.lngLat.lat, e.lngLat.lng));
    m.on("load", () => {
      for (const id of ["boundaries", "risk", "hotspots", "incidents", "fires", "subscribers", "circle"])
        m.addSource(id, { type: "geojson", data: EMPTY });

      m.addLayer({
        id: "risk", type: "fill", source: "risk",
        paint: {
          "fill-color": ["interpolate", ["linear"], ["get", "p"], 0.01, "#fff5dc", 0.03, "#ffc857", 0.05, "#f26b5b", 0.1, "#b3182b"],
          "fill-opacity": ["interpolate", ["linear"], ["get", "p"], 0.01, 0.25, 0.1, 0.75],
        },
      });
      m.addLayer({ id: "hotspots-gi", type: "fill", source: "hotspots", filter: ["==", ["get", "kind"], "gi"],
        paint: { "fill-color": ["match", ["get", "label"], "99%", "#b3182b", "95%", "#f26b5b", "#ffc857"], "fill-opacity": 0.45 } });
      m.addLayer({ id: "hotspots-cluster", type: "line", source: "hotspots", filter: ["==", ["get", "kind"], "cluster"],
        paint: { "line-color": "#3a3a5c", "line-width": 2, "line-dasharray": [2, 1.5] } });
      m.addLayer({ id: "boundaries", type: "line", source: "boundaries",
        paint: { "line-color": "#5f6470", "line-width": 0.8, "line-opacity": 0.6 } });
      m.addLayer({ id: "circle", type: "fill", source: "circle", paint: { "fill-color": "#3d4fd6", "fill-opacity": 0.1 } });
      m.addLayer({ id: "circle-line", type: "line", source: "circle", paint: { "line-color": "#3d4fd6", "line-width": 1.5 } });
      m.addLayer({ id: "subscribers", type: "circle", source: "subscribers",
        paint: { "circle-radius": 3, "circle-color": "#3d4fd6", "circle-opacity": 0.7 } });
      m.addLayer({ id: "fires", type: "circle", source: "fires",
        paint: { "circle-radius": 4, "circle-color": "#ff8a00", "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      m.addLayer({
        id: "incidents", type: "circle", source: "incidents",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "fatalities"], 0, 4, 10, 8, 50, 14],
          "circle-color": ["match", ["get", "status"], "reported", "#f26b5b", "verified", "#e0a526", "responded", "#3a3a5c", "#8e3e91"],
          "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1,
        },
      });

      for (const id of ["incidents", "fires", "risk", "hotspots-gi", "hotspots-cluster", "boundaries"]) {
        m.on("click", id, (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          if (f) onSelectRef.current?.(id, f.properties as Record<string, unknown>, e.lngLat);
        });
        if (id !== "boundaries") {
          m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
        }
      }
      setReady(true);
    });
    map.current = m;
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const set = (id: string, data: FC | null | undefined) => (m.getSource(id) as GeoJSONSource).setData(data ?? EMPTY);
    set("boundaries", layers.boundaries);
    set("risk", layers.risk);
    set("hotspots", layers.hotspots);
    set("incidents", layers.incidents);
    set("fires", layers.fires);
    set("subscribers", layers.subscribers);
    set("circle", layers.circle ? circlePolygon(layers.circle.lat, layers.circle.lon, layers.circle.radiusKm) : null);
  }, [ready, layers.boundaries, layers.risk, layers.hotspots, layers.incidents, layers.fires, layers.subscribers, layers.circle]);

  return <div ref={el} className={className} style={{ height, width: "100%" }} />;
}
