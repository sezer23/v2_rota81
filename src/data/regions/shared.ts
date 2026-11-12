import { FixedCategoryTag, ProvinceMeta, Place, RegionName } from '../../types';

export type RawStopTuple = [
  name: string,
  category: FixedCategoryTag,
  duration: number,
  lat: number,
  lng: number,
  tip: string
];

export interface RawProvinceEntry extends ProvinceMeta {
  stops: RawStopTuple[];
}

export function slugifyTr(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function expandProvinceEntries(entries: RawProvinceEntry[]): {
  provinces: ProvinceMeta[];
  places: Place[];
} {
  const provinces: ProvinceMeta[] = [];
  const places: Place[] = [];

  for (const entry of entries) {
    provinces.push({
      plate: entry.plate,
      name: entry.name,
      region: entry.region as RegionName,
      lat: entry.lat,
      lng: entry.lng,
      summary: entry.summary,
    });

    entry.stops.forEach((stop, index) => {
      const [name, category, duration, lat, lng, tip] = stop;
      places.push({
        id: `tr-${entry.plate}-${index + 1}-${slugifyTr(name).slice(0, 28)}`,
        city: entry.name,
        region: entry.region,
        category,
        name,
        duration,
        lat,
        lng,
        tip,
      });
    });
  }

  return { provinces, places };
}
