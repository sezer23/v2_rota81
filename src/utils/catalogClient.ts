import { Place } from '../types';

/** Sunucuda şehir şehir kayıtlı katalogları getirir. Sunucu yoksa null döner. */
export async function fetchServerCatalog(): Promise<Record<string, Place[]> | null> {
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) return null;
    const data = await res.json();
    const out: Record<string, Place[]> = {};
    for (const [city, entry] of Object.entries(data?.cities || {})) {
      const places = (entry as { places?: Place[] }).places;
      if (Array.isArray(places)) out[city] = places;
    }
    return out;
  } catch {
    return null;
  }
}

/** Tek bir şehrin kataloğunu sunucuya (catalog-data/<şehir>.json) yazar. */
export async function saveCityCatalog(
  city: string,
  plate: string | undefined,
  places: Place[]
): Promise<boolean> {
  try {
    const res = await fetch(`/api/catalog/${encodeURIComponent(city)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, plate, places }),
    });
    return res.ok;
  } catch {
    return false;
  }
}