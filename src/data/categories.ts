import { CategoryMeta, FixedCategoryTag } from '../types';

export const CATEGORY_DEFINITIONS: CategoryMeta[] = [
  {
    tag: '#antik-kent',
    label: 'Antik Kentler & Ören Yerleri',
    shortLabel: 'Antik Kent',
    description: 'UNESCO mirasları, antik tiyatrolar, höyükler ve arkeolojik ören yerleri',
    defaultDuration: 90,
  },
  {
    tag: '#tarih',
    label: 'Tarihi Yapılar & Kent Mirası',
    shortLabel: 'Tarihi Miras',
    description: 'Tarihi hanlar, taş köprüler, sivil mimari konaklar, kuleler ve meydanlar',
    defaultDuration: 60,
  },
  {
    tag: '#müze',
    label: 'Müzeler & Kültür Merkezleri',
    shortLabel: 'Müze',
    description: 'Arkeoloji, etnografya, mozaik ve tematik kent müzeleri',
    defaultDuration: 75,
  },
  {
    tag: '#inanç',
    label: 'İnanç & Manevi Miras',
    shortLabel: 'İnanç',
    description: 'Tarihi camiler, külliyeler, medreseler, manastırlar, kiliseler ve türbeler',
    defaultDuration: 45,
  },
  {
    tag: '#kale',
    label: 'Kaleler, Surlar & Hisarlar',
    shortLabel: 'Kale & Sur',
    description: 'Savunma kaleleri, tarihi surlar, burçlar ve gözetleme hisarları',
    defaultDuration: 60,
  },
  {
    tag: '#saray',
    label: 'Saraylar, Köşkler & Kasırlar',
    shortLabel: 'Saray & Köşk',
    description: 'Osmanlı ve Anadolu sarayları, kasırlar ve tarihi köşkler',
    defaultDuration: 90,
  },
  {
    tag: '#doğa',
    label: 'Doğa, Kanyon, Şelale & Yayla',
    shortLabel: 'Doğa',
    description: 'Milli parklar, şelaleler, kanyonlar, göller, mağaralar, yaylalar ve koylar',
    defaultDuration: 90,
  },
  {
    tag: '#manzara',
    label: 'Seyir Terasları & Panoramalar',
    shortLabel: 'Manzara',
    description: 'Gün batımı tepeleri, teleferik noktaları ve panoramik seyir terasları',
    defaultDuration: 45,
  },
  {
    tag: '#çarşı',
    label: 'Tarihi Çarşılar & Sokaklar',
    shortLabel: 'Çarşı',
    description: 'Bedestenler, bakırcılar çarşıları, arastalar ve yürüyüş caddeleri',
    defaultDuration: 60,
  },
  {
    tag: '#restoran',
    label: 'Yöresel Gastronomi & Lezzet',
    shortLabel: 'Gastronomi',
    description: 'Coğrafi işaretli yöresel mutfaklar, esnaf lokantaları ve ikonik lezzet durakları',
    defaultDuration: 60,
  },
  {
    tag: '#kafe',
    label: 'Kahve, Çay & Mola Noktaları',
    shortLabel: 'Kafe & Mola',
    description: 'Tarihi kahvehaneler, çay bahçeleri, tatlı ve mola durakları',
    defaultDuration: 40,
  },
  {
    tag: '#etkinlik',
    label: 'Deneyim, Atölye & Etkinlik',
    shortLabel: 'Etkinlik',
    description: 'Tekne turları, balon seyri, çömlek atölyeleri ve termal deneyimler',
    defaultDuration: 90,
  },
  {
    tag: '#konaklama',
    label: 'Konaklama Tesisleri',
    shortLabel: 'Konaklama',
    description: 'Butik taş oteller, termal tesisler ve şehir otelleri',
    defaultDuration: 0,
  },
];

export const FIXED_TAGS: FixedCategoryTag[] = CATEGORY_DEFINITIONS.map((c) => c.tag);

export const REGIONS_LIST = [
  'Marmara',
  'Ege',
  'Akdeniz',
  'İç Anadolu',
  'Karadeniz',
  'Doğu Anadolu',
  'Güneydoğu Anadolu',
] as const;

export function getCategoryMeta(tag?: string): CategoryMeta | undefined {
  if (!tag) return undefined;
  const normalized = normalizeTag(tag);
  return CATEGORY_DEFINITIONS.find((c) => c.tag === normalized);
}

export function getCategoryLabel(tag?: string): string {
  if (!tag) return 'Genel';
  const meta = getCategoryMeta(tag);
  if (meta) return meta.shortLabel;
  return tag.replace(/^#/, '');
}

export function getCategoryFullLabel(tag?: string): string {
  if (!tag) return 'Diğer Duraklar';
  const meta = getCategoryMeta(tag);
  if (meta) return meta.label;
  return tag.startsWith('#') ? tag : `#${tag}`;
}

export function normalizeTag(tag?: string): string {
  let t = String(tag || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-');
  if (!t) return '';
  if (!t.startsWith('#')) t = '#' + t;
  if ((FIXED_TAGS as string[]).includes(t)) return t;

  const rules: Array<[string[], FixedCategoryTag]> = [
    [['otel', 'konaklama', 'pansiyon', 'resort', 'hotel'], '#konaklama'],
    [['saray', 'köşk', 'kasır'], '#saray'],
    [['müze', 'galeri'], '#müze'],
    [['cami', 'türbe', 'kilise', 'manastır', 'sinagog', 'tapınak', 'dini', 'inanç', 'medrese', 'külliye'], '#inanç'],
    [['restoran', 'lokanta', 'yemek', 'gastronomi', 'kebap', 'lezzet', 'mutfak', 'sofra'], '#restoran'],
    [['kafe', 'cafe', 'kahve', 'çay', 'tatlı'], '#kafe'],
    [['antik', 'ören', 'harabe', 'höyük', 'tiyatro'], '#antik-kent'],
    [['kale', 'hisar', 'sur', 'burç'], '#kale'],
    [['çarşı', 'pazar', 'bedesten', 'arasta', 'han', 'alışveriş'], '#çarşı'],
    [['festival', 'konser', 'etkinlik', 'tekne', 'balon', 'termal', 'atölye'], '#etkinlik'],
    [['manzara', 'seyir', 'teras', 'tepe', 'teleferik'], '#manzara'],
    [['doğa', 'park', 'şelale', 'göl', 'plaj', 'milli', 'kanyon', 'yayla', 'mağara', 'vadi', 'koy'], '#doğa'],
    [['tarih', 'kültür', 'miras', 'köprü', 'konak', 'meydan', 'anıt'], '#tarih'],
  ];

  for (const [keys, target] of rules) {
    if (keys.some((k) => t.includes(k))) return target;
  }
  return t;
}

export function isAccommodationPlace(category?: string, name?: string): boolean {
  const lowerCat = (category || '').toLocaleLowerCase('tr-TR');
  const lowerName = (name || '').toLocaleLowerCase('tr-TR');
  return (
    lowerCat === '#konaklama' ||
    lowerCat.includes('konaklama') ||
    lowerName.includes('otel') ||
    lowerName.includes('hotel') ||
    lowerName.includes('resort')
  );
}