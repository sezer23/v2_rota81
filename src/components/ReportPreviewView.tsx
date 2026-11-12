import { Download, Printer } from 'lucide-react';
import { TourDay } from '../types';
import { getCategoryLabel, isAccommodationPlace } from '../data/categories';
import {
  calculateDayTimes,
  calculateItinerarySummary,
  formatHoursMins,
} from '../utils/geoAndTime';

interface ReportPreviewViewProps {
  tourTitle: string;
  days: TourDay[];
  onDownloadHtmlReport: () => void;
  onGoToPlanner: () => void;
}

export function ReportPreviewView({
  tourTitle,
  days,
  onDownloadHtmlReport,
  onGoToPlanner,
}: ReportPreviewViewProps) {
  const summary = calculateItinerarySummary(days);
  const displayTitle = tourTitle.trim() || 'Türkiye Kültür ve Gezi Rotası';

  if (days.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3 max-w-2xl mx-auto">
        <h2 className="font-display text-lg font-bold text-slate-900">
          Raporlanacak Gün Bulunmuyor
        </h2>
        <p className="text-xs text-slate-600">
          Önce Planlayıcı veya Hızlı AI Sihirbazı üzerinden en az bir günlük gezi programı oluşturun.
        </p>
        <button
          type="button"
          onClick={onGoToPlanner}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
        >
          Planlayıcıya Dön
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Actions Bar (Hidden on Print) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-base font-bold text-slate-900">
            Yazdırılabilir Tur Raporu Önizleme
          </h1>
          <p className="text-xs text-slate-500">
            Doğrudan tarayıcıdan PDF olarak yazdırabilir veya bağımsız .html rapor dosyası olarak indirebilirsiniz.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Yazdır / PDF Kaydet</span>
          </button>
          <button
            type="button"
            onClick={onDownloadHtmlReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Raporu İndir (.html)</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet */}
      <article className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 space-y-8 print:border-0 print:p-0">
        <header className="border-b-2 border-slate-900 pb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {displayTitle}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {summary.usedCities.join(' · ') || 'Türkiye Geneli'}
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums">
            Oluşturma Tarihi: {new Date().toLocaleDateString('tr-TR')}
          </div>
        </header>

        {/* Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-lg bg-stone-50">
          <div className="p-3">
            <div className="text-[11px] text-slate-500">Toplam Süre</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatHoursMins(summary.totalMinutes)}
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] text-slate-500">Gün Sayısı</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.dayCount} Gün
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] text-slate-500">Durak Sayısı</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.totalStops} Durak
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] text-slate-500">Araç Yolu</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.totalRoadKm} km ({summary.totalDriveMins} dk)
            </div>
          </div>
          <div className="p-3">
            <div className="text-[11px] text-slate-500">Yürüyüş</div>
            <div className="text-sm font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {summary.totalWalkMins} dk
            </div>
          </div>
        </div>

        {/* Day-by-Day Table */}
        <div className="space-y-8">
          {days.map((day, dIdx) => {
            const times = calculateDayTimes(day);
            return (
              <section key={day.id} className="space-y-3 break-inside-avoid">
                <h3 className="font-display text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
                  {String(dIdx + 1).padStart(2, '0')}. Gün — {day.title}
                </h3>

                {day.places.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Bu güne durak eklenmedi.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {day.places.map((p, pIdx) => {
                      const isHotel = isAccommodationPlace(p.category, p.name);
                      const transit = day.transits?.[pIdx];

                      return (
                        <div key={p.id} className="py-3 space-y-2">
                          <div className="flex items-start gap-4">
                            <div className="w-16 font-mono tabular-nums text-xs font-bold text-amber-800 pt-0.5 shrink-0">
                              {times[pIdx] || '09:30'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-slate-900">
                                {p.name}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {p.city} · {getCategoryLabel(p.category)} ·{' '}
                                {isHotel ? 'Konaklama' : `${p.duration} dk ziyaret`}
                              </div>
                              {p.tip && (
                                <p className="text-xs text-slate-600 mt-1">{p.tip}</p>
                              )}
                            </div>
                          </div>

                          {pIdx < day.places.length - 1 && transit && (
                            <div className="pl-20 text-[11px] text-slate-500 font-mono tabular-nums">
                              Geçiş:{' '}
                              {transit.isWalkingOnly
                                ? `${transit.walkMin} dk yürüyüş`
                                : `${transit.km} km araç (${transit.min} dk)${
                                    transit.walkMin ? ` + ${transit.walkMin} dk yürüyüş` : ''
                                  }`}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}
