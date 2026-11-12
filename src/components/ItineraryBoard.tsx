import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarPlus,
  Compass,
  Download,
  FileText,
  GitMerge,
  GripVertical,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
  Check,
  StickyNote,
  Edit3,
  Bookmark,
  BookmarkPlus,
  Save,
} from 'lucide-react';
import { AiGeneratedStop, Place, TourDay, TransitInfo } from '../types';
import { getCategoryLabel, isAccommodationPlace } from '../data/categories';
import {
  calculateDayTimes,
  calculateItinerarySummary,
  formatHoursMins,
} from '../utils/geoAndTime';
import { QUICK_AI_PRESETS, QuickPresetRoute } from '../data/turkeyCatalog';

// Standart ve ulaşım kategorileri listesi
const AVAILABLE_CATEGORIES = [
  { id: '#ulaşım', label: 'Ulaşım (Uçuş & Transfer)' },
  { id: '#tarih', label: 'Tarihi Miras' },
  { id: '#müze', label: 'Müze & Sergi' },
  { id: '#inanç', label: 'İnanç Merkezi' },
  { id: '#doğa', label: 'Doğa & Park' },
  { id: '#restoran', label: 'Gastronomi / Restoran' },
  { id: '#çarşı', label: 'Çarşı & Alışveriş' },
  { id: '#antik-kent', label: 'Antik Kent' },
  { id: '#konaklama', label: 'Konaklama / Otel' },
  { id: '#etkinlik', label: 'Etkinlik & Aktivite' },
];

const DRAFT_KEY = 'rota81_manual_drafts_v1';

export interface SavedTemplate {
  id: string;
  name: string;
  createdAt: string;
  tourTitle: string;
  days: TourDay[];
}

interface ItineraryBoardProps {
  tourTitle: string;
  onChangeTourTitle: (val: string) => void;
  days: TourDay[];
  activeDayId: string | null;
  onSelectActiveDay: (dayId: string) => void;
  onAddNewDay: () => void;
  onRemoveDay: (dayId: string) => void;
  onClearAllDays: () => void;
  onResetToFactory: () => void;
  onUpdateDayTitle: (dayId: string, title: string) => void;
  onUpdateCustomTime: (dayId: string, placeIdx: number, timeVal: string) => void;
  onUpdatePlaceDuration: (dayId: string, placeIdx: number, duration: number) => void;
  onRemovePlaceFromDay: (dayId: string, placeIdx: number) => void;
  onMovePlaceInDay: (dayId: string, fromIdx: number, toIdx: number) => void;
  onMovePlaceAcrossDays: (fromDayId: string, fromIdx: number, toDayId: string, toIdx?: number) => void;
  onDropCatalogPlaceOnDay: (catalogPlaceId: string, toDayId: string, toIdx?: number) => void;
  onUpdateTransit: (dayId: string, idx: number, patch: Partial<TransitInfo>) => void;
  onOpenAiGuide: (placeName: string, city: string) => void;
  onOpenAiWizard: () => void;
  onRunQuickPreset: (preset: QuickPresetRoute) => Promise<void>;
  quickPresetLoadingId: string | null;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onMergeJson: (file: File) => void;
  onDownloadReport: () => void;
  onApplyOptimizedDay: (dayId: string, orderedIds: string[], startTimes: string[]) => void;
  onAddSuggestedStopToDay: (dayId: string, stop: AiGeneratedStop) => void;
  onSave: () => void;
  savedTemplates: SavedTemplate[];
  onSaveTemplate: () => void;
  onLoadTemplate: (templateId: string, mode: 'replace' | 'append') => void;
  onDeleteTemplate: (templateId: string) => void;
  onNotify: (msg: string) => void;
}

interface ManualFormState {
  isOpen: boolean;
  city: string;
  title: string;
  desc: string;
  category: string;
}

export function ItineraryBoard({
  tourTitle,
  onChangeTourTitle,
  days,
  activeDayId,
  onSelectActiveDay,
  onAddNewDay,
  onRemoveDay,
  onClearAllDays,
  onResetToFactory,
  onUpdateDayTitle,
  onUpdateCustomTime,
  onUpdatePlaceDuration,
  onRemovePlaceFromDay,
  onMovePlaceInDay,
  onMovePlaceAcrossDays,
  onDropCatalogPlaceOnDay,
  onUpdateTransit,
  onOpenAiGuide,
  onOpenAiWizard,
  onRunQuickPreset,
  quickPresetLoadingId,
  onExportJson,
  onImportJson,
  onMergeJson,
  onDownloadReport,
  onAddSuggestedStopToDay,
  onSave,
  savedTemplates,
  onSaveTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  onNotify,
}: ItineraryBoardProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [dragOverDayId, setDragOverDayId] = useState<string | null>(null);
  const [activeTimeKey, setActiveTimeKey] = useState<string | null>(null);
  const [templateAction, setTemplateAction] = useState<{ id: string; type: 'load' | 'delete' } | null>(null);

  // Manuel Ekle Form Alanları
  // Yarım kalan manuel durak formları da otomatik saklanır
  const [manualForms, setManualForms] = useState<Record<string, ManualFormState>>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, ManualFormState>;
        }
      }
    } catch {
      // ignore
    }
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(manualForms));
    } catch {
      // ignore
    }
  }, [manualForms]);

  // Transit düzenleme state'leri
  const [editingTransitKey, setEditingTransitKey] = useState<string | null>(null);
  const [transitKmInput, setTransitKmInput] = useState<number>(0);
  const [transitMinInput, setTransitMinInput] = useState<number>(0);
  const [transitWalkMinInput, setTransitWalkMinInput] = useState<number>(0);

  const summary = calculateItinerarySummary(days);

  // Sekmelerde gösterilen gün: aktif gün, yoksa ilk gün
  const selectedDay = days.find((d) => d.id === activeDayId) ?? days[0];

  function handleDayDrop(e: React.DragEvent, toDayId: string) {
    e.preventDefault();
    setDragOverDayId(null);
    const catalogId = e.dataTransfer.getData('application/x-rota81-catalog-id');
    if (catalogId) {
      onDropCatalogPlaceOnDay(catalogId, toDayId);
      return;
    }
    const stopPayload = e.dataTransfer.getData('application/x-rota81-day-stop');
    if (stopPayload) {
      try {
        const parsed = JSON.parse(stopPayload) as {
          fromDayId: string;
          fromIdx: number;
        };
        onMovePlaceAcrossDays(parsed.fromDayId, parsed.fromIdx, toDayId);
      } catch {
        // ignore
      }
    }
  }

  function handleGuideOrAiClick(place: Place) {
    if (place.tip && place.tip.trim().length > 0 && place.tip !== 'Konaklama tesisi') {
      onNotify(`Hafızadaki Not: "${place.tip}"`);
    }
    onOpenAiGuide(place.name, place.city);
  }

  function handleToggleManualForm(dayId: string) {
    setManualForms(prev => ({
      ...prev,
      [dayId]: {
        isOpen: !prev[dayId]?.isOpen,
        city: prev[dayId]?.city || '',
        title: prev[dayId]?.title || '',
        desc: prev[dayId]?.desc || '',
        category: prev[dayId]?.category || '#tarih'
      }
    }));
  }

  function handleSaveManualStop(dayId: string) {
    const form = manualForms[dayId];
    if (!form || (!form.title.trim() && !form.desc.trim())) {
      onNotify('Lütfen en azından bir başlık veya not girin.');
      return;
    }

    const newPlace: Place = {
      id: `manual-${Date.now()}`,
      name: form.title.trim() || 'Manuel Durak',
      city: form.city.trim() || 'Genel',
      category: form.category.trim() || '#tarih',
      duration: 45,
      lat: 0,
      lng: 0,
      tip: form.desc.trim()
    };

    onAddSuggestedStopToDay(dayId, newPlace);
    onNotify('Durak başarıyla eklendi.');

    setManualForms(prev => ({
      ...prev,
      [dayId]: { isOpen: false, city: '', title: '', desc: '', category: '#tarih' }
    }));
  }

  // KM değiştiğinde araç ve yürüme dakikalarını otomatik hesaplayan yardımcı fonksiyon
  function handleKmChange(val: number) {
    const km = Math.max(0, val);
    setTransitKmInput(km);
    // Örn: Ortalama araç hızı ~50-60 km/s (1 km yaklaşık 1-1.2 dk sürer, trafiksiz ortalama hesap)
    // Yürüme hızı: 1 km yaklaşık 12-15 dakika sürer.
    const calculatedDriveMin = Math.round(km * 1.2);
    const calculatedWalkMin = Math.round(km * 15);

    setTransitMinInput(calculatedDriveMin);
    setTransitWalkMinInput(calculatedWalkMin);
  }

  // Kartın içinde, en üstte görünen gün sekmeleri
  const dayTabs = (
    <div
      className="px-3 pt-3 bg-stone-50/80 border-b border-slate-200 rounded-t-xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-end gap-1 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="Gün sekmeleri"
      >
        {days.map((tabDay, tabIndex) => {
          const isSelected = tabDay.id === selectedDay?.id;
          const isDropTarget = dragOverDayId === tabDay.id;
          return (
            <button
              key={tabDay.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectActiveDay(tabDay.id)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverDayId(tabDay.id);
              }}
              onDragLeave={() => setDragOverDayId(null)}
              onDrop={(e) => {
                e.stopPropagation();
                handleDayDrop(e, tabDay.id);
              }}
              title={tabDay.title}
              className={`shrink-0 px-3.5 py-2 text-xs font-bold font-mono tabular-nums rounded-t-lg border transition-colors ${
                isDropTarget
                  ? 'bg-amber-50 border-amber-400 text-amber-900'
                  : isSelected
                  ? 'bg-white border-slate-200 border-b-white -mb-px text-slate-900'
                  : 'bg-transparent border-transparent text-slate-500 hover:bg-stone-100 hover:text-slate-800'
              }`}
            >
              {tabIndex + 1}. Gün
            </button>
          );
        })}

        <button
          type="button"
          onClick={onAddNewDay}
          className="shrink-0 mb-1 ml-1 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-stone-100 border border-dashed border-slate-300 rounded-md transition-colors"
          title="Yeni gün ekle"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Gün</span>
        </button>
      </div>
    </div>
  );

  return (
    <section className="flex flex-col gap-4">
      {/* Main Tour Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="tour-title-input" className="sr-only">
              Tur Başlığı
            </label>
            <input
              id="tour-title-input"
              type="text"
              value={tourTitle}
              onChange={(e) => onChangeTourTitle(e.target.value)}
              placeholder="Tur Başlığını Yazın (Örn: Büyük Güneydoğu & Mezopotamya Rotası)..."
              className="w-full font-display text-lg sm:text-xl font-bold text-slate-900 placeholder:text-slate-400 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-600 focus:outline-none pb-1 transition-colors"
            />
            <div className="text-xs text-slate-500 mt-1">
              {summary.usedCities.length > 0
                ? summary.usedCities.join(' · ')
                : 'Soldaki 81 il kataloğundan durak ekleyin veya Hızlı AI Sihirbazı ile saniyeler içinde program oluşturun.'}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onOpenAiWizard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Hızlı AI Rota Oluştur</span>
            </button>

            <button
              type="button"
              onClick={onAddNewDay}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>Yeni Gün</span>
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
              title="Tüm verileri kaydet (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Kaydet</span>
            </button>

            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Arşivle (.json)</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportJson(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span>Yükle</span>
            </button>

            <input
              ref={mergeInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onMergeJson(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => mergeInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
            >
              <GitMerge className="w-3.5 h-3.5 text-slate-500" />
              <span>Birleştir</span>
            </button>

            <button
              type="button"
              onClick={onDownloadReport}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Rapor İndir</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {days.length > 0 &&
              (confirmClearOpen ? (
                <div className="inline-flex items-center gap-1.5 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                  <span className="text-rose-800 font-medium">Günler silinsin mi?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllDays();
                      setConfirmClearOpen(false);
                    }}
                    className="font-bold text-rose-700 hover:underline"
                  >
                    Evet
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(false)}
                    className="text-slate-600 hover:underline"
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Günleri Temizle</span>
                </button>
              ))}

            {confirmResetOpen ? (
              <div className="inline-flex items-center gap-1.5 bg-stone-100 px-2.5 py-1 rounded-md border border-slate-300">
                <span className="text-slate-800 font-medium">81 il varsayılanına dön?</span>
                <button
                  type="button"
                  onClick={() => {
                    onResetToFactory();
                    setConfirmResetOpen(false);
                  }}
                  className="font-bold text-amber-800 hover:underline"
                >
                  Sıfırla
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetOpen(false)}
                  className="text-slate-600 hover:underline"
                >
                  Vazgeç
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmResetOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-slate-600 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Varsayılana Dön</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabular Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-lg bg-stone-50/70">
          <div className="px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Toplam Gün</div>
            <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {summary.dayCount} Gün
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Toplam Durak</div>
            <div className="text-sm font-bold text-amber-700 font-mono tabular-nums mt-0.5">
              {summary.totalStops} Durak
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Araç Mesafesi</div>
            <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {summary.totalRoadKm} km ({summary.totalDriveMins} dk)
            </div>
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[11px] text-slate-500">Yürüyüş</div>
            <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {summary.totalWalkMins} dk
            </div>
          </div>
          <div className="px-3 py-2.5 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-500">Genel Süre</div>
            <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
              {formatHoursMins(summary.totalMinutes)}
            </div>
          </div>
        </div>

        {/* Quick AI Presets Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar text-xs">
          <span className="text-slate-500 font-medium whitespace-nowrap shrink-0 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            Tek Tıkla AI Şablonu:
          </span>
          {QUICK_AI_PRESETS.map((preset) => {
            const loading = quickPresetLoadingId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={Boolean(quickPresetLoadingId)}
                onClick={() => onRunQuickPreset(preset)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium text-slate-700 bg-stone-100 hover:bg-amber-50 hover:text-amber-900 border border-slate-200/80 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-3 h-3 animate-spin text-amber-600" />}
                <span>{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Kayıtlı Şablonlarım */}
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            <span className="text-slate-500 font-medium whitespace-nowrap shrink-0 flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-amber-600" />
              Şablonlarım:
            </span>

            <button
              type="button"
              disabled={!days.some((d) => d.places.length > 0)}
              onClick={onSaveTemplate}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Mevcut programı tek tıkla şablon olarak kaydet"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-amber-800" />
              <span>Şablon Olarak Kaydet</span>
            </button>

            {savedTemplates.length === 0 && (
              <span className="text-slate-400 whitespace-nowrap shrink-0">
                Henüz kayıtlı şablon yok
              </span>
            )}

            {savedTemplates.map((tpl) => (
              <div
                key={tpl.id}
                className="inline-flex items-center shrink-0 bg-stone-100 border border-slate-200/80 rounded-md overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (days.length === 0) {
                      onLoadTemplate(tpl.id, 'replace');
                    } else {
                      setTemplateAction({ id: tpl.id, type: 'load' });
                    }
                  }}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-900 transition-colors whitespace-nowrap"
                  title="Şablonu yükle"
                >
                  <span className="max-w-[180px] truncate">{tpl.name}</span>
                  <span className="text-slate-400 font-mono tabular-nums">· {tpl.days.length} gün</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateAction({ id: tpl.id, type: 'delete' })}
                  className="px-1.5 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Şablonu sil"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {templateAction &&
            (() => {
              const tpl = savedTemplates.find((t) => t.id === templateAction.id);
              if (!tpl) return null;

              if (templateAction.type === 'delete') {
                return (
                  <div className="flex flex-wrap items-center gap-2 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                    <span className="text-rose-800 font-medium">
                      "{tpl.name}" şablonu silinsin mi?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteTemplate(tpl.id);
                        setTemplateAction(null);
                      }}
                      className="font-bold text-rose-700 hover:underline"
                    >
                      Sil
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateAction(null)}
                      className="text-slate-600 hover:underline"
                    >
                      Vazgeç
                    </button>
                  </div>
                );
              }

              return (
                <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <span className="text-amber-950 font-medium">
                    "{tpl.name}" yüklensin mi?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onLoadTemplate(tpl.id, 'replace');
                      setTemplateAction(null);
                    }}
                    className="font-bold text-amber-800 hover:underline"
                  >
                    Mevcut Programı Değiştir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onLoadTemplate(tpl.id, 'append');
                      setTemplateAction(null);
                    }}
                    className="font-bold text-slate-800 hover:underline"
                  >
                    Sonuna Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateAction(null)}
                    className="text-slate-600 hover:underline"
                  >
                    Vazgeç
                  </button>
                </div>
              );
            })()}
        </div>
      </div>

      {/* Days List */}
      {days.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <Compass className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="font-display text-base font-bold text-slate-900">
              Gezi Programınız Henüz Boş
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Soldaki 81 İl Türkiye Kataloğundan istediğiniz şehri seçip durakları tek tıkla ekleyebilir veya Hızlı AI Sihirbazına şehir ve gün sayısını söyleyerek tüm rotayı 2 saniyede kurdurabilirsiniz.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={onOpenAiWizard}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI ile Otomatik Program Kur</span>
            </button>
            <button
              type="button"
              onClick={onAddNewDay}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Günü Manuel Başlat</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            // Sadece seçili günü göster
            if (day.id !== selectedDay?.id) return null;

            const isActive = true;
            const times = calculateDayTimes(day);
            const formState = manualForms[day.id] || { isOpen: false, city: '', title: '', desc: '', category: '#tarih' };

            let dayRoadKm = 0;
            let dayDriveMins = 0;
            let dayWalkMins = 0;
            let dayVisitMins = 0;

            day.places.forEach((p) => {
              if (!isAccommodationPlace(p.category, p.name)) {
                dayVisitMins += Math.max(0, Number(p.duration) || 0);
              }
            });
            (day.transits || []).forEach((t) => {
              if (t.isWalkingOnly) {
                dayWalkMins += Math.max(0, Number(t.walkMin) || 0);
              } else {
                dayRoadKm += Math.max(0, Number(t.km) || 0);
                dayDriveMins += Math.max(0, Number(t.min) || 0);
              }
            });
            const dayTotalMins = dayVisitMins + dayDriveMins + dayWalkMins;

            return (
              <div
                key={day.id}
                onClick={() => onSelectActiveDay(day.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverDayId(day.id);
                }}
                onDragLeave={() => setDragOverDayId(null)}
                onDrop={(e) => handleDayDrop(e, day.id)}
                className={`bg-white rounded-xl border transition-colors ${
                  dragOverDayId === day.id
                    ? 'border-amber-500 ring-2 ring-amber-500/20'
                    : isActive
                    ? 'border-slate-900'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {dayTabs}

                {/* Day Header (başlık sekmelerin altında) */}
                <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
                    <input
                      type="text"
                      value={day.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onUpdateDayTitle(day.id, e.target.value)}
                      className="font-display text-sm sm:text-base font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-600 focus:outline-none px-1 py-0.5 flex-1 min-w-[140px]"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums">
                    <span>{dayRoadKm} km</span>
                    <span aria-hidden="true">·</span>
                    <span>{dayWalkMins} dk yürüyüş</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">
                      {formatHoursMins(dayTotalMins)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveDay(day.id);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors ml-1"
                      title="Bu günü sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Day Action Sub-Bar */}
                <div
                  className="px-4 py-2 bg-stone-50/80 border-b border-slate-100 flex items-center justify-end gap-2 flex-wrap text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleToggleManualForm(day.id)}
                      className="inline-flex items-center gap-1 px-3 py-1 font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors whitespace-nowrap shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-800" />
                      <span>+ Ekle</span>
                    </button>
                  </div>
                </div>

                {/* --- MANUEL EKLEME FORMU --- */}
                {formState.isOpen && (
                  <div
                    className="p-4 bg-amber-50/90 border-b border-amber-200 space-y-3 m-3 rounded-lg shadow-inner"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950">
                      <span className="flex items-center gap-1.5">
                        <StickyNote className="w-4 h-4 text-amber-700" />
                        Manuel Durak / Not Ekle
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleManualForm(day.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Şehir:</label>
                        <input
                          type="text"
                          placeholder="Örn: Mardin"
                          value={formState.city}
                          onChange={(e) => setManualForms(prev => ({
                            ...prev,
                            [day.id]: { ...prev[day.id], city: e.target.value }
                          }))}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-600 text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Kategori (Listeden Seçin veya Yazın):
                        </label>
                        <input
                          type="text"
                          list={`category-list-${day.id}`}
                          placeholder="Örn: #tarih, #ulaşım veya Manuel Kategori..."
                          value={formState.category}
                          onChange={(e) => setManualForms(prev => ({
                            ...prev,
                            [day.id]: { ...prev[day.id], category: e.target.value }
                          }))}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-600 text-slate-900"
                        />
                        <datalist id={`category-list-${day.id}`}>
                          {AVAILABLE_CATEGORIES.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.label}</option>
                          ))}
                        </datalist>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Başlık:</label>
                      <input
                        type="text"
                        placeholder="Örn: Uçuş: THY TK20 (IST -> GZT) veya Yemek Molası"
                        value={formState.title}
                        onChange={(e) => setManualForms(prev => ({
                          ...prev,
                          [day.id]: { ...prev[day.id], title: e.target.value }
                        }))}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-600 font-medium text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Not:</label>
                      <textarea
                        rows={2}
                        placeholder="Açıklama, transfer detayları veya özel talimatlar..."
                        value={formState.desc}
                        onChange={(e) => setManualForms(prev => ({
                          ...prev,
                          [day.id]: { ...prev[day.id], desc: e.target.value }
                        }))}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-600 text-slate-700 resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleToggleManualForm(day.id)}
                        className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md transition-colors"
                      >
                        İptal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveManualStop(day.id)}
                        className="px-3.5 py-1 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md transition-colors shadow-sm inline-flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Rotaya Ekle</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Stops List */}
                <div className="p-3 sm:p-4">
                  {day.places.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                      Bu güne henüz durak eklenmedi. Soldaki katalogdan <strong>+ Ekle</strong> butonuna basın veya durağı buraya sürükleyin.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {day.places.map((place, pIdx) => {
                        const startTime = times[pIdx] || '09:30';
                        const catLabel = getCategoryLabel(place.category);

                        // Durağın ÜSTÜNDEKİ çubuk, bir önceki durakla bu durak arasındaki geçiştir.
                        // transits[i] = i. durak ile (i+1). durak arası olduğundan indeks pIdx - 1'dir.
                        const transitIdx = pIdx - 1;
                        const transit =
                          (pIdx > 0 ? day.transits?.[transitIdx] : undefined) || {
                            km: 0,
                            min: 0,
                            walkMin: 0,
                            isWalkingOnly: false,
                          };

                        const timeKey = `${day.id}-${pIdx}`;
                        const isTimeActive = activeTimeKey === timeKey;

                        const transitKey = `${day.id}-${pIdx}`;
                        const isTransitEditing = editingTransitKey === transitKey;

                        return (
                          <React.Fragment key={place.id}>
                            {/* Mesafe / Transit Ölçüm Barı */}
                            {pIdx > 0 && (
                              <div className="relative my-2 px-2">
                                <div
                                  className="flex items-center justify-center cursor-pointer group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const currentWalk = transit.isWalkingOnly;
                                    onUpdateTransit(day.id, transitIdx, { isWalkingOnly: !currentWalk });
                                    onNotify(!currentWalk ? 'Yalnızca yürüyüş rotasına çevrildi.' : 'Araç rotasına çevrildi.');
                                  }}
                                  title="Araç / Yürüyüş modunu değiştirmek için tıklayın"
                                >
                                  <div className="flex items-center gap-2 px-3.5 py-1.5 bg-stone-100 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-full text-[11px] font-mono text-slate-600 transition-colors shadow-2xs">
                                    {transit.isWalkingOnly ? (
                                      <>
                                        <span>🚶 Yürüyüş Rotası</span>
                                        <span>·</span>
                                        <span className="font-semibold text-amber-800">
                                          {(transit.km || 0).toFixed(1)} km ({transit.walkMin || 0} dk)
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span>🚗 Araçla Geçiş</span>
                                        <span>·</span>
                                        <span className="font-semibold text-slate-900">
                                          {(transit.km || 0).toFixed(1)} km · {transit.min || 0} dk
                                        </span>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-slate-500">
                                          ({transit.walkMin || 0} dk yürüme)
                                        </span>
                                      </>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setTransitKmInput(transit.km || 0);
                                        setTransitMinInput(transit.min || 0);
                                        setTransitWalkMinInput(transit.walkMin || 0);
                                        setEditingTransitKey(isTransitEditing ? null : transitKey);
                                      }}
                                      className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-amber-100 border border-slate-300 hover:border-amber-400 rounded text-[10px] font-semibold text-amber-900 transition-colors shadow-2xs"
                                      title="KM ve süreleri elle değiştir"
                                    >
                                      <Edit3 className="w-3 h-3 text-amber-700" />
                                      <span>Değiştir</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Elle Veri Girişi Popup Paneli (KM değiştikçe otomatik hesaplayan yapı) */}
                                {isTransitEditing && (
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 bg-white border border-amber-300 shadow-xl rounded-xl p-3 w-72 space-y-2.5 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                                      <span>Mesafe ve Süreyi Düzenle</span>
                                      <button
                                        type="button"
                                        onClick={() => setEditingTransitKey(null)}
                                        className="text-slate-400 hover:text-slate-700"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div className="space-y-2">
                                      <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                          Mesafe (KM) <span className="text-[9px] text-amber-700 font-normal">(Değiştikçe süreler otomatik hesaplanır)</span>:
                                        </label>
                                        <input
                                          type="number"
                                          step={0.5}
                                          min={0}
                                          value={transitKmInput}
                                          onChange={(e) => handleKmChange(parseFloat(e.target.value) || 0)}
                                          className="w-full px-2 py-1 bg-stone-50 border border-slate-200 rounded font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Araç Süresi (Dakika):</label>
                                        <input
                                          type="number"
                                          step={5}
                                          min={0}
                                          value={transitMinInput}
                                          onChange={(e) => setTransitMinInput(parseInt(e.target.value) || 0)}
                                          className="w-full px-2 py-1 bg-stone-50 border border-slate-200 rounded font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Yürüme Süresi (Dakika):</label>
                                        <input
                                          type="number"
                                          step={5}
                                          min={0}
                                          value={transitWalkMinInput}
                                          onChange={(e) => setTransitWalkMinInput(parseInt(e.target.value) || 0)}
                                          className="w-full px-2 py-1 bg-stone-50 border border-slate-200 rounded font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-1.5 pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingTransitKey(null)}
                                        className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-stone-100 rounded"
                                      >
                                        İptal
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onUpdateTransit(day.id, transitIdx, {
                                            km: transitKmInput,
                                            min: transitMinInput,
                                            walkMin: transitWalkMinInput
                                          });
                                          setEditingTransitKey(null);
                                          onNotify('Mesafe ve süreler güncellendi.');
                                        }}
                                        className="px-3 py-1 text-[11px] font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded shadow-sm inline-flex items-center gap-1"
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Kaydet</span>
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  'application/x-rota81-day-stop',
                                  JSON.stringify({ fromDayId: day.id, fromIdx: pIdx })
                                );
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const catalogId = e.dataTransfer.getData(
                                  'application/x-rota81-catalog-id'
                                );
                                if (catalogId) {
                                  onDropCatalogPlaceOnDay(catalogId, day.id, pIdx);
                                  return;
                                }
                                const stopPayload = e.dataTransfer.getData(
                                  'application/x-rota81-day-stop'
                                );
                                if (stopPayload) {
                                  try {
                                    const parsed = JSON.parse(stopPayload) as {
                                      fromDayId: string;
                                      fromIdx: number;
                                    };
                                    if (parsed.fromDayId === day.id) {
                                      onMovePlaceInDay(day.id, parsed.fromIdx, pIdx);
                                    } else {
                                      onMovePlaceAcrossDays(
                                        parsed.fromDayId,
                                        parsed.fromIdx,
                                        day.id,
                                        pIdx
                                      );
                                    }
                                  } catch {
                                    // ignore
                                  }
                                }
                              }}
                              className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors"
                            >
                              {/* Left: Handle + Arrows + Start Time */}
                              <div
                                className="flex items-center gap-2 shrink-0 relative"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span
                                  className="text-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing"
                                  title="Sürükleyip taşıyın"
                                >
                                  <GripVertical className="w-4 h-4" />
                                </span>

                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    disabled={pIdx === 0}
                                    onClick={() => onMovePlaceInDay(day.id, pIdx, pIdx - 1)}
                                    className="text-slate-400 hover:text-slate-800 disabled:opacity-25"
                                    title="Yukarı taşı"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pIdx === day.places.length - 1}
                                    onClick={() => onMovePlaceInDay(day.id, pIdx, pIdx + 1)}
                                    className="text-slate-400 hover:text-slate-800 disabled:opacity-25"
                                    title="Aşağı taşı"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="relative">
                                  <input
                                    type="text"
                                    maxLength={5}
                                    value={startTime}
                                    onFocus={() => setActiveTimeKey(timeKey)}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        setActiveTimeKey(null);
                                      }, 200);
                                    }}
                                    onChange={(e) => onUpdateCustomTime(day.id, pIdx, e.target.value)}
                                    className="w-16 px-2 py-1 text-xs font-bold font-mono tabular-nums text-amber-900 bg-amber-50 border border-amber-200 rounded-md text-center focus:outline-none focus:border-amber-600"
                                    title="Başlangıç saati (Düzenlemek için tıklayın)"
                                  />

                                  {isTimeActive && (
                                    <div className="absolute left-0 top-full mt-1.5 z-20 flex items-center gap-1 bg-white border border-amber-300 shadow-lg p-1.5 rounded-lg whitespace-nowrap">
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          const [h, m] = startTime.split(':').map(Number);
                                          const totalMins = (h * 60) + m - 15;
                                          const newH = Math.floor((totalMins + 1440) % 1440 / 60);
                                          const newM = (totalMins + 1440) % 1440 % 60;
                                          onUpdateCustomTime(day.id, pIdx, `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                                        }}
                                        className="px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
                                      >
                                        -15 dk
                                      </button>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          const [h, m] = startTime.split(':').map(Number);
                                          const totalMins = (h * 60) + m + 15;
                                          const newH = Math.floor((totalMins % 1440) / 60);
                                          const newM = totalMins % 1440 % 60;
                                          onUpdateCustomTime(day.id, pIdx, `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
                                        }}
                                        className="px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
                                      >
                                        +15 dk
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Center: Meta + Name + Tip */}
                              <div className="flex-1 min-w-[180px]">
                                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-700">
                                    {place.city}
                                  </span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{catLabel || place.category}</span>
                                </div>
                                <h5 className="text-sm font-semibold text-slate-900 leading-snug">
                                  {place.name}
                                </h5>
                                {place.tip && (
                                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                                    {place.tip}
                                  </p>
                                )}
                              </div>

                              {/* Right: Duration + Guide Button + Delete */}
                              <div
                                className="flex items-center gap-2 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1 bg-stone-50 border border-slate-200 px-2 py-1 rounded-md">
                                  <input
                                    type="number"
                                    min={0}
                                    max={600}
                                    step={5}
                                    value={place.duration}
                                    onChange={(e) =>
                                      onUpdatePlaceDuration(
                                        day.id,
                                        pIdx,
                                        Math.max(0, parseInt(e.target.value) || 0)
                                      )
                                    }
                                    className="w-12 text-xs font-mono font-bold text-slate-900 bg-transparent text-center focus:outline-none"
                                  />
                                  <span className="text-[11px] text-slate-500">dk</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleGuideOrAiClick(place)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors"
                                  title="Rehber Bilgi Kartı"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-amber-700" />
                                  <span className="hidden sm:inline">Rehber</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => onRemovePlaceFromDay(day.id, pIdx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Duraktan çıkar"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}