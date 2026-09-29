// Copies the MapLibre module worker into public/ so the browser can load it directly.
import { cpSync, mkdirSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist";
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) cpSync(`${src}/${f}`, `public/maplibre/${f}`);
