export type RegionName =
  | 'Marmara'
  | 'Ege'
  | 'Akdeniz'
  | 'İç Anadolu'
  | 'Karadeniz'
  | 'Doğu Anadolu'
  | 'Güneydoğu Anadolu';

export type FixedCategoryTag =
  | '#antik-kent'
  | '#tarih'
  | '#müze'
  | '#inanç'
  | '#kale'
  | '#saray'
  | '#doğa'
  | '#manzara'
  | '#çarşı'
  | '#restoran'
  | '#kafe'
  | '#konaklama'
  | '#etkinlik';

export interface CategoryMeta {
  tag: FixedCategoryTag;
  label: string;
  shortLabel: string;
  description: string;
  defaultDuration: number;
}

export interface ProvinceMeta {
  plate: string;
  name: string;
  region: RegionName;
  lat: number;
  lng: number;
  summary: string;
}

export interface Place {
  id: string;
  city: string;
  region?: RegionName;
  category: string;
  name: string;
  duration: number;
  tip: string;
  lat: number;
  lng: number;
  isCustom?: boolean;
  //güncelleme: 2026-11-12
  district?: string;
  address?: string;
  phone?: string;
  priceMinUsd?: number;
  priceMaxUsd?: number;
  priceUnit?: string;       // 'gecelik' | 'kişi başı'
  priceUpdatedAt?: string;  // fiyatın girildiği tarih
  source?: string;
  guide?: AiGuideNote;      // kataloğa kaydedilen rehber bilgisi
  //güncellendi.
  customGuideInfo?: {
    description: string; // Senin elinle düzelttiğin açıklama
    tip: string;         // Senin elinle düzelttiğin rehber tüyosu
    duration: string;    // Süre
  };
}

export interface TransitInfo {
  km: number;
  min: number;
  walkMin: number;
  isWalkingOnly: boolean;
}

export interface TourDay {
  id: string;
  title: string;
  places: Place[];
  transits: TransitInfo[];
  customTimes: Record<number, string>;
}

export interface AiGuideSource {
  title: string;
  uri: string;
}

export interface AiGuideNote {
  intro: string;
  story: string;
  highlights: string[];
  positive_reviews?: string[];
  negative_reviews?: string[];
  rating_note?: string;
  local_tip: string;
  must_eat_nearby?: string;
  best_time: string;
  duration: number;
  tag: string;
  sources?: AiGuideSource[];
  mode: 'fast' | 'live_search';
  modelUsed?: string;
  elapsedMs?: number;
}

export interface AiWizardRequest {
  cities: string[];
  dayCount: number;
  tempo: 'rahat' | 'dengeli' | 'yogun';
  categories: string[];
  notes: string;
}

export interface AiGeneratedStop {
  name: string;
  city: string;
  category: string;
  duration: number;
  tip: string;
  lat: number;
  lng: number;
  startTime?: string;
}

export interface AiGeneratedDay {
  title: string;
  stops: AiGeneratedStop[];
}

export interface AiWizardResponse {
  tourTitle: string;
  summary: string;
  days: AiGeneratedDay[];
  elapsedMs?: number;
}

export type ActiveWorkspaceView = 'planner' | 'ai-wizard' | 'turkey-atlas' | 'report';
// DOSYA: src/types.ts

export type LogisticsCategory = 'LOGISTICS_FLIGHT' | 'LOGISTICS_TRANSFER';

// DOSYA: src/types.ts

export interface FlightItem {
  id: string;
  category: 'LOGISTICS_FLIGHT';
  title: string;
  flightType: 'departure' | 'arrival' | 'transit';
  airport: {
    code: string;
    city: string;
    name: string;
    lat: number;
    lng: number;
  };
  departureTime: string;  // Kalkış saati (Örn: 08:30)
  arrivalTime: string;    // Varış saati (Örn: 10:15)
  bufferEndTime?: string; // Bagaj/çıkış eklenmiş hali (+45 dk)
  city: string;
}

export interface TransferItem {
  id: string;
  category: 'LOGISTICS_TRANSFER';
  vehicle: 'Otobüs' | 'Midibüs' | 'Minibüs' | 'Tren' | 'Özel VIP Araç';
  fromCity: string;
  toCity: string;
  departureTime: string; // Kalkış saati
  arrivalTime: string;   // Varış saati
  distance: number;
  duration: string;
  city: string;
}