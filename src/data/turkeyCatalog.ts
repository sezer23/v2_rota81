import { Place, ProvinceMeta, RegionName } from '../types';
import { expandProvinceEntries, RawProvinceEntry } from './regions/shared';
import { MARMARA_PROVINCES } from './regions/marmara';
import { EGE_PROVINCES } from './regions/ege';
import { AKDENIZ_PROVINCES } from './regions/akdeniz';
import { IC_ANADOLU_PROVINCES } from './regions/icAnadolu';
import { KARADENIZ_PROVINCES } from './regions/karadeniz';
import { DOGU_ANADOLU_PROVINCES } from './regions/doguAnadolu';
import { GUNEYDOGU_ANADOLU_PROVINCES } from './regions/guneydoguAnadolu';

const ALL_RAW_ENTRIES: RawProvinceEntry[] = [
  ...MARMARA_PROVINCES,
  ...EGE_PROVINCES,
  ...AKDENIZ_PROVINCES,
  ...IC_ANADOLU_PROVINCES,
  ...KARADENIZ_PROVINCES,
  ...DOGU_ANADOLU_PROVINCES,
  ...GUNEYDOGU_ANADOLU_PROVINCES,
].sort((a, b) => Number(a.plate) - Number(b.plate));

const expanded = expandProvinceEntries(ALL_RAW_ENTRIES);

export const PROVINCES_81: ProvinceMeta[] = expanded.provinces;

export const PROVINCES_SORTED_ALPHA: ProvinceMeta[] = [...PROVINCES_81].sort((a, b) =>
  a.name.localeCompare(b.name, 'tr-TR')
);

export const INITIAL_TURKEY_CATALOG: Place[] = expanded.places;

export const PROVINCE_BY_NAME: Record<string, ProvinceMeta> = Object.fromEntries(
  PROVINCES_81.map((p) => [p.name, p])
);

export function getProvinceRegion(cityName: string): RegionName | undefined {
  return PROVINCE_BY_NAME[cityName]?.region;
}

export interface QuickPresetRoute {
  id: string;
  label: string;
  cities: string[];
  dayCount: number;
  tempo: 'rahat' | 'dengeli' | 'yogun';
  categories: string[];
  notes: string;
}

export const QUICK_AI_PRESETS: QuickPresetRoute[] = [
  {
    id: 'gap-klasik',
    label: 'GAP Kültür & Gastronomi (4 Gün)',
    cities: ['Gaziantep', 'Şanlıurfa', 'Mardin'],
    dayCount: 4,
    tempo: 'dengeli',
    categories: ['#antik-kent', '#müze', '#tarih', '#restoran'],
    notes: 'Göbeklitepe, Zeugma, Eski Mardin taş sokakları ve her gün yöresel kebap/tatlı durakları olsun.',
  },
  {
    id: 'kapadokya-detay',
    label: 'Kapadokya Vadiler & Yeraltı (3 Gün)',
    cities: ['Nevşehir', 'Aksaray', 'Kayseri'],
    dayCount: 3,
    tempo: 'dengeli',
    categories: ['#doğa', '#antik-kent', '#manzara', '#etkinlik', '#restoran'],
    notes: 'Sabah balon seyri, Göreme, Derinkuyu, Ihlara Vadisi ve testi kebabı dengeli dağılsın.',
  },
  {
    id: 'dogu-karadeniz',
    label: 'Doğu Karadeniz Yaylalar (4 Gün)',
    cities: ['Trabzon', 'Rize', 'Artvin'],
    dayCount: 4,
    tempo: 'dengeli',
    categories: ['#doğa', '#manzara', '#inanç', '#kale', '#restoran'],
    notes: 'Sümela, Uzungöl, Fırtına Vadisi, Pokut/Ayder ve Borçka Karagöl doğa ağırlıklı planlansın.',
  },
  {
    id: 'ege-antik',
    label: 'Kuzeyden Güneye Antik Ege (5 Gün)',
    cities: ['Çanakkale', 'İzmir', 'Aydın', 'Denizli'],
    dayCount: 5,
    tempo: 'dengeli',
    categories: ['#antik-kent', '#doğa', '#tarih', '#restoran'],
    notes: 'Troya, Assos, Efes, Şirince, Afrodisias ve Pamukkale Hierapolis kronolojik sırayla gezilsin.',
  },
  {
    id: 'dogu-ekspresi',
    label: 'Kars - Erzurum - Van Kültür Rotası (4 Gün)',
    cities: ['Erzurum', 'Kars', 'Iğdır', 'Van'],
    dayCount: 4,
    tempo: 'dengeli',
    categories: ['#antik-kent', '#tarih', '#inanç', '#doğa', '#restoran'],
    notes: 'Çifte Minareli Medrese, Ani Ören Yeri, İshak Paşa / Gökkuşağı Tepeleri ve Akdamar Adası.',
  },
];
