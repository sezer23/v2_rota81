import { Place, TourDay, TransitInfo } from '../types';
import { getCategoryLabel, isAccommodationPlace } from '../data/categories';

export function sanitizeCityName(rawCity?: string): string {
  if (!rawCity) return 'İstanbul';
  const cleaned = rawCity
    .replace(/il merkezi/gi, '')
    .replace(/büyükşehir belediyesi/gi, '')
    .replace(/belediyesi/gi, '')
    .replace(/bölgesi/gi, '')
    .replace(/\bili\b/gi, '')
    .replace(/ilçesi/gi, '')
    .trim();
  if (!cleaned) return 'İstanbul';
  return cleaned.charAt(0).toLocaleUpperCase('tr-TR') + cleaned.slice(1);
}

export function minutesToTimeStr(totalMins: number): string {
  const normalized = ((totalMins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeStrToMinutes(timeStr?: string): number {
  if (!timeStr || !timeStr.includes(':')) return 570; // 09:30 default
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/** Durağın geçerli (sıfır olmayan) koordinatı var mı? Manuel duraklarda (uçuş, not vb.) olmayabilir. */
export function hasCoords(p?: Pick<Place, 'lat' | 'lng'>): boolean {
  return Boolean(p && Number(p.lat) && Number(p.lng));
}

export function calculatePairDistance(p1: Pick<Place, 'lat' | 'lng'>, p2: Pick<Place, 'lat' | 'lng'>): { roadKm: number; driveMins: number } {
  if (!p1?.lat || !p1?.lng || !p2?.lat || !p2?.lng) {
    return { roadKm: 1.2, driveMins: 5 };
  }
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const rawKm = R * c * 1.25;
  const roadKm = Math.max(0.2, parseFloat(rawKm.toFixed(1)));
  const avgSpeed = roadKm > 50 ? 70 : roadKm > 10 ? 45 : 30;
  const driveMins = Math.max(3, Math.round((roadKm / avgSpeed) * 60));
  return { roadKm, driveMins };
}

export function calculateTransitBetween(p1?: Place, p2?: Place, isWalkingOnly = false): TransitInfo {
  if (!p1 || !p2 || !hasCoords(p1) || !hasCoords(p2)) {
    // Koordinat yoksa mesafe uydurma; kullanıcı elle girebilir
    return { km: 0, min: 0, walkMin: 0, isWalkingOnly: false };
  }
  const { roadKm, driveMins } = calculatePairDistance(p1, p2);

  // KURAL: Kullanıcı manuel işaretlediyse VEYA mesafe 1.5 km altındaysa yürüyüş hesapla
  const shouldUseWalking = isWalkingOnly || roadKm <= 1.5;

  if (shouldUseWalking) {
    const walkMinutes = Math.max(3, Math.round((roadKm * 1000) / 75));
    return {
      km: Number(roadKm.toFixed(1)),
      min: 0,
      walkMin: walkMinutes,
      isWalkingOnly: shouldUseWalking,
    };
  }

  // 1.5 km ve üzeri ve kullanıcı yürüyüş seçmediyse -> Araç geçişi
  return {
    km: Math.max(0.2, Math.round(roadKm * 10) / 10),
    min: driveMins,
    walkMin: 0,
    isWalkingOnly: false,
  };
}

/**
 * Kayıtlı / içe aktarılmış geçişleri tutarlı hale getirir:
 *  - Yalnızca yürüyüş KAPALIYSA: walkMin her zaman 0; km ve dk 0 ise koordinatlardan yeniden hesaplanır.
 *  - Yalnızca yürüyüş AÇIKSA: araç dakikası 0; yürüme dakikası yoksa mesafeden hesaplanır.
 *  - Eksik geçiş varsa yeniden üretilir.
 */
export function sanitizeTransits(places: Place[], transits?: TransitInfo[]): TransitInfo[] {
  const result: TransitInfo[] = [];
  for (let i = 0; i < Math.max(0, places.length - 1); i++) {
    const t = transits?.[i];
    if (!t) {
      result.push(calculateTransitBetween(places[i], places[i + 1]));
      continue;
    }

    const fromPlace = places[i];
    const toPlace = places[i + 1];

    if (!fromPlace || !toPlace || !hasCoords(fromPlace) || !hasCoords(toPlace)) {
      // Koordinatsız duraklarda değerler kullanıcıya ait; otomatik uydurma yapma
      const walking = Boolean(t.isWalkingOnly);
      result.push({
        km: Math.max(0, Number(t.km) || 0),
        min: walking ? 0 : Math.max(0, Number(t.min) || 0),
        walkMin: walking ? Math.max(0, Number(t.walkMin) || 0) : 0,
        isWalkingOnly: walking,
      });
      continue;
    }

    const { roadKm, driveMins } = calculatePairDistance(fromPlace, toPlace);
    const km = Math.max(0, Number(t.km) || 0);
    const min = Math.max(0, Number(t.min) || 0);
    const walkMin = Math.max(0, Number(t.walkMin) || 0);

    if (t.isWalkingOnly) {
      result.push({
        km,
        min: 0,
        walkMin: walkMin > 0 ? walkMin : Math.max(3, Math.round(((km || roadKm) * 1000) / 75)),
        isWalkingOnly: true,
      });
    } else {
      const fixedKm = km > 0 ? km : roadKm;
      const fixedMin = min > 0 ? min : km > 0 ? Math.max(3, Math.round((km / (km > 50 ? 70 : km > 10 ? 45 : 30)) * 60)) : driveMins;
      result.push({
        km: fixedKm,
        min: fixedMin,
        walkMin: 0,
        isWalkingOnly: false,
      });
    }
  }
  return result;
}

export function buildDayTransits(places: Place[], existing?: TransitInfo[]): TransitInfo[] {
  const result: TransitInfo[] = [];
  for (let i = 0; i < Math.max(0, places.length - 1); i++) {
    const prev = existing?.[i];
    if (prev && (prev.km > 0 || prev.min > 0 || prev.walkMin > 0 || prev.isWalkingOnly)) {
      result.push(prev);
    } else {
      result.push(calculateTransitBetween(places[i], places[i + 1], prev?.isWalkingOnly));
    }
  }
  return sanitizeTransits(places, result);
}

export function recalculateAllDayTransits(places: Place[]): TransitInfo[] {
  const transits: TransitInfo[] = [];
  for (let i = 0; i < places.length - 1; i++) {
    const from = places[i];
    const to = places[i + 1];

    // Koordinatı olmayan manuel duraklar (uçuş, not vb.): mesafe uydurma, 0 bırak
    if (!from || !to || !hasCoords(from) || !hasCoords(to)) {
      transits.push({ km: 0, min: 0, walkMin: 0, isWalkingOnly: false });
      continue;
    }

    const { roadKm, driveMins } = calculatePairDistance(from, to);

    // 1.5 km kuralı burada da aktif
    const isWalk = roadKm <= 1.5;
    transits.push({
      km: Math.round(roadKm * 10) / 10,
      min: isWalk ? 0 : driveMins,
      walkMin: isWalk ? Math.max(3, Math.round((roadKm * 1000) / 75)) : 0,
      isWalkingOnly: isWalk,
    });
  }
  return transits;
}

export function calculateDayTimes(day: TourDay): string[] {
  const times: string[] = [];
  let currentMins = 570; // 09:30 start

  day.places.forEach((place, idx) => {
    if (day.customTimes && day.customTimes[idx]) {
      currentMins = timeStrToMinutes(day.customTimes[idx]);
    }
    times[idx] = minutesToTimeStr(currentMins);

    const visitDuration = isAccommodationPlace(place.category, place.name)
      ? 0
      : Math.max(0, Number(place.duration) || 0);
    const t = day.transits?.[idx];
    let transitDuration = 0;
    if (t) {
      // Yürüyüş modunda yalnızca yürüme, araç modunda yalnızca araç dakikası sayılır
      transitDuration = t.isWalkingOnly
        ? Math.max(0, Number(t.walkMin) || 0)
        : Math.max(0, Number(t.min) || 0);
    }
    currentMins += visitDuration + transitDuration;
  });

  return times;
}

export function calculateItinerarySummary(days: TourDay[]) {
  let totalMinutes = 0;
  let totalStops = 0;
  let totalRoadKm = 0;
  let totalDriveMins = 0;
  let totalWalkMins = 0;
  const usedCities: string[] = [];

  days.forEach((day) => {
    totalStops += day.places.length;
    day.places.forEach((p) => {
      if (!isAccommodationPlace(p.category, p.name)) {
        totalMinutes += Math.max(0, Number(p.duration) || 0);
      }
      if (p.city && !usedCities.includes(p.city)) {
        usedCities.push(p.city);
      }
    });
    (day.transits || []).forEach((t) => {
      if (t.isWalkingOnly) {
        const walk = Math.max(0, Number(t.walkMin) || 0);
        totalWalkMins += walk;
        totalMinutes += walk;
      } else {
        const km = Math.max(0, Number(t.km) || 0);
        const min = Math.max(0, Number(t.min) || 0);
        totalRoadKm += km;
        totalDriveMins += min;
        totalMinutes += min;
      }
    });
  });

  return {
    dayCount: days.length,
    totalStops,
    totalRoadKm: Math.round(totalRoadKm * 10) / 10,
    totalDriveMins,
    totalWalkMins,
    totalMinutes,
    hours: Math.floor(totalMinutes / 60),
    mins: totalMinutes % 60,
    usedCities,
  };
}

export function formatHoursMins(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

export function generatePrintableHtml(tourTitle: string, days: TourDay[]): string {
  const summary = calculateItinerarySummary(days);
  const safeTitle = tourTitle.trim() || 'Türkiye Kültür ve Gezi Rotası';

  const esc = (v?: string | number) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch)
    );

  const daysMarkup = days
    .map((day, dIdx) => {
      const times = calculateDayTimes(day);
      const stopsHtml = day.places
        .map((p, pIdx) => {
          const catLabel = getCategoryLabel(p.category);
          const isHotel = isAccommodationPlace(p.category, p.name);
          const transit = day.transits?.[pIdx];
          const transitRow =
            pIdx < day.places.length - 1 && transit
              ? `<div class="transit">Geçiş: ${
                  transit.isWalkingOnly
                    ? `${transit.walkMin} dk yürüyüş`
                    : `${transit.km} km araç (${transit.min} dk)`
                }</div>`
              : '';

          return `
            <div class="stop-row">
              <div class="stop-time">${esc(times[pIdx] || '09:30')}</div>
              <div class="stop-body">
                <div class="stop-title">${esc(p.name)}</div>
                <div class="stop-meta">${esc(p.city)} · ${esc(catLabel)}${!isHotel ? ` · ${esc(p.duration)} dk ziyaret` : ' · Konaklama'}</div>
                ${p.tip ? `<div class="stop-tip">${esc(p.tip)}</div>` : ''}
              </div>
            </div>
            ${transitRow}
          `;
        })
        .join('');

      return `
        <section class="day-section">
          <h2>${dIdx + 1}. Gün — ${esc(day.title)}</h2>
          ${stopsHtml || '<p class="empty">Bu güne henüz durak eklenmedi.</p>'}
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>${esc(safeTitle)} — Rota Raporu</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; max-width: 840px; margin: 0 auto; padding: 40px 28px; line-height: 1.5; }
    .top-bar { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 4px 0; }
    .sub { font-size: 13px; color: #475569; }
    .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 28px; background: #f8fafc; }
    .metric-label { font-size: 11px; color: #64748b; display: block; }
    .metric-val { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .day-section { margin-bottom: 28px; page-break-inside: avoid; }
    h2 { font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin: 0 0 12px 0; color: #0f172a; }
    .stop-row { display: flex; gap: 16px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .stop-time { width: 58px; font-weight: 700; font-family: monospace; font-size: 13px; color: #b45309; flex-shrink: 0; padding-top: 2px; }
    .stop-title { font-weight: 600; font-size: 14px; }
    .stop-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
    .stop-tip { font-size: 12px; color: #334155; margin-top: 4px; }
    .transit { font-size: 11px; color: #64748b; padding: 4px 0 4px 74px; border-bottom: 1px dashed #e2e8f0; }
    .print-btn { background: #0f172a; color: #fff; border: 0; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
    @media print { .print-btn { display: none; } body { padding: 16px; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Yazdır / PDF Olarak Kaydet</button>
  <div class="top-bar">
    <div>
      <h1>${esc(safeTitle)}</h1>
      <div class="sub">${esc(summary.usedCities.join(' · ') || 'Türkiye Geneli')}</div>
    </div>
    <div class="sub">Tarih: ${new Date().toLocaleDateString('tr-TR')}</div>
  </div>
  <div class="metrics">
    <div><span class="metric-label">Toplam Gün</span><span class="metric-val">${summary.dayCount} Gün</span></div>
    <div><span class="metric-label">Toplam Durak</span><span class="metric-val">${summary.totalStops} Durak</span></div>
    <div><span class="metric-label">Araç Mesafesi</span><span class="metric-val">${summary.totalRoadKm} km (${summary.totalDriveMins} dk)</span></div>
    <div><span class="metric-label">Yürüyüş</span><span class="metric-val">${summary.totalWalkMins} dk</span></div>
    <div><span class="metric-label">Toplam Süre</span><span class="metric-val">${summary.hours} sa ${summary.mins} dk</span></div>
  </div>
  ${daysMarkup}
</body>
</html>`;
}