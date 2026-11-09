import catalogue from "./provinces.json";

export interface Province { code: string; name: string; shortName: string }
export interface Ward { code: string; name: string }
export const provinces: readonly Province[] = catalogue;

export function normalizeLocationText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN").trim();
}

export function provinceForLocation(value: string): Province | undefined {
  const normalized = normalizeLocationText(value);
  return provinces.find(province => {
    const shortName = normalizeLocationText(province.shortName);
    return normalized === shortName || normalized === normalizeLocationText(province.name) || normalized.endsWith(`, ${shortName}`);
  });
}

export function wardForLocation(value: string, province?: Province): string {
  if (!province || !value.includes(",")) return "";
  return value.slice(0, value.lastIndexOf(",")).trim();
}

export function locationSearchValue(province?: Province, wardName = ""): string {
  return province ? (wardName ? `${wardName}, ${province.shortName}` : province.shortName) : "";
}

const wardsCache = new Map<string, Ward[]>();
export async function loadProvinceWards(code: string, signal: AbortSignal): Promise<Ward[]> {
  if (!provinces.some(province => province.code === code)) throw new Error("Invalid province");
  const cached = wardsCache.get(code);
  if (cached) return cached;
  const response = await fetch(`/data/vietnam-wards/${code}.json`, { signal });
  if (!response.ok) throw new Error("Ward catalogue unavailable");
  const wards: unknown = await response.json();
  if (!Array.isArray(wards) || !wards.every(ward => ward && typeof ward.code === "string" && typeof ward.name === "string")) throw new Error("Invalid ward catalogue");
  wardsCache.set(code, wards);
  return wards;
}
