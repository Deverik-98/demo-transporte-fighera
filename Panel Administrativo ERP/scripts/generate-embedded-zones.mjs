import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const url = "https://infra.datos.gob.ar/georef/provincias.geojson";
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
const collection = await res.json();

const pairs = [
  [
    "zona-bsas",
    (f) => f.properties?.nombre === "Buenos Aires" && f.properties?.categoria === "Provincia",
  ],
  ["zona-santafe", (f) => f.properties?.nombre === "Santa Fe"],
  ["zona-sanjuan", (f) => f.properties?.nombre === "San Juan"],
  ["zona-tucuman", (f) => f.properties?.nombre === "Tucumán"],
  ["zona-cordoba", (f) => f.properties?.nombre === "Córdoba"],
];

const out = {};
for (const [id, pred] of pairs) {
  const feat = collection.features.find(pred);
  if (!feat) throw new Error(`No feature for ${id}`);
  out[id] = {
    type: "Feature",
    properties: {
      source: "IGN / georef provincias (datos.gob.ar)",
      nombre: feat.properties.nombre,
    },
    geometry: feat.geometry,
  };
}

const banner = `// Geometrías oficiales IGN (provincias) embebidas: el mapa funciona sin Nominatim ni red.\n// Fuente: https://infra.datos.gob.ar/georef/provincias.geojson\n\n`;

const body = `${banner}export const embeddedOperationalZoneFeatures = ${JSON.stringify(out)} as const;\n\nexport type EmbeddedOperationalZoneId = keyof typeof embeddedOperationalZoneFeatures;\n`;

const dest = path.join(root, "src", "app", "lib", "embedded-operational-zone-geometries.ts");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, body, "utf8");
console.log("Wrote", dest, "chars", body.length);
