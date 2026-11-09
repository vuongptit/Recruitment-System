// Snapshot the public VietnamProvinces v2 catalogue. Browsers use local assets.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = "https://provinces.open-api.vn/api/v2/?depth=2";
const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Location catalogue returned HTTP ${response.status}`);
const catalogue = await response.json();
if (!Array.isArray(catalogue) || catalogue.length < 30) throw new Error("Incomplete province catalogue");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wardsDirectory = path.join(root, "public", "data", "vietnam-wards");
const indexDirectory = path.join(root, "lib", "locations");
const provinces = [];
const wardFiles = [];
const seenCodes = new Set();
for (const province of catalogue) {
  if (typeof province.name !== "string" || !Number.isInteger(province.code) || !Array.isArray(province.wards) || !province.wards.length) throw new Error("Invalid province record");
  const code = String(province.code).padStart(2, "0");
  const shortName = province.name.replace(/^(Thành phố|Tỉnh)\s+/u, "");
  const wards = province.wards.map(ward => {
    if (typeof ward.name !== "string" || !Number.isInteger(ward.code) || seenCodes.has(ward.code)) throw new Error("Invalid or duplicate ward record");
    if (typeof ward.province_code === "number" && ward.province_code !== province.code) throw new Error("Ward belongs to a different province");
    seenCodes.add(ward.code);
    return { code: String(ward.code).padStart(5, "0"), name: ward.name };
  }).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  provinces.push({ code, name: province.name, shortName });
  wardFiles.push([code, wards]);
}
if (seenCodes.size < 3000) throw new Error("Incomplete ward catalogue");
await mkdir(wardsDirectory, { recursive: true });
await mkdir(indexDirectory, { recursive: true });
for (const [code, wards] of wardFiles) await writeFile(path.join(wardsDirectory, `${code}.json`), JSON.stringify(wards) + "\n");
await writeFile(path.join(indexDirectory, "provinces.json"), JSON.stringify(provinces, null, 2) + "\n");
await writeFile(path.join(indexDirectory, "source.json"), JSON.stringify({ source, retrievedAt: new Date().toISOString(), model: "province-ward", provinceCount: provinces.length, wardCount: seenCodes.size }, null, 2) + "\n");
console.log(`Saved ${provinces.length} provinces and ${seenCodes.size} wards to local assets.`);
