import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut, Route, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import {
  ActiveWorkspaceView,
  AiGeneratedStop,
  AiGuideNote,
  AiWizardResponse,
  Place,
  RegionName,
  TourDay,
  TransitInfo,
} from './types';
import { normalizeTag } from './data/categories';
import {
  INITIAL_TURKEY_CATALOG,
  PROVINCE_BY_NAME,
  PROVINCES_81,
  QuickPresetRoute,
} from './data/turkeyCatalog';
import {
  buildDayTransits,
  calculatePairDistance,
  generatePrintableHtml,
  recalculateAllDayTransits,
  sanitizeCityName,
} from './utils/geoAndTime';
import { getAiHeaders, getStoredApiKey } from './utils/aiApi';
import { fetchServerCatalog, saveCityCatalog } from './utils/catalogClient';
import { TopNav } from './components/TopNav';
import { CatalogPanel } from './components/CatalogPanel';
import { ItineraryBoard, type SavedTemplate } from './components/ItineraryBoard';
import { FastAiWizardView } from './components/FastAiWizardView';
import { AiGuideModal } from './components/AiGuideModal';
import { CustomPlaceModal } from './components/CustomPlaceModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { ReportPreviewView } from './components/ReportPreviewView';
import { CloudAccess } from './components/CloudAccess';
import { isCloudConfigured, loadPlannerState, savePlannerState, supabase } from './utils/supabase';
import type { PersistedPlannerState } from './types/persistence';

const STORAGE_KEY = 'rota81_planner_state_v1';
const EXPORT_VERSION = 2;
const VIEW_KEY = 'rota81_active_view_v1';
const VALID_VIEWS = ['planner', 'ai-wizard', 'turkey-atlas', 'report'];

type PersistedState = PersistedPlannerState;

const INITIAL_CITY_BY_ID = new Map<string, string>(
  INITIAL_TURKEY_CATALOG.map((p) => [p.id, p.city])
);

/** Tarayıcıdaki bekleyen katalog değişikliklerinin (ekleme/düzenleme/silme) hangi şehirleri etkilediği */
function overlayCities(
  customPlaces: Place[],
  editedPlaces: Record<string, Place>,
  deletedPlaceIds: string[]
): string[] {
  const set = new Set<string>();
  customPlaces.forEach((p) => p.city && set.add(p.city));
  Object.entries(editedPlaces).forEach(([id, p]) => {
    if (p.city) set.add(p.city);
    const baseCity = INITIAL_CITY_BY_ID.get(id);
    if (baseCity) set.add(baseCity);
  });
  deletedPlaceIds.forEach((id) => {
    const baseCity = INITIAL_CITY_BY_ID.get(id);
    if (baseCity) {
      set.add(baseCity);
    } else {
      const c = customPlaces.find((p) => p.id === id)?.city;
      if (c) set.add(c);
    }
  });
  return Array.from(set);
}

/** Tüm çalışma durumunu tarayıcıya yazar. Başarısız olursa false döner. */
function saveStateToStorage(value: PersistedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadInitialView(): ActiveWorkspaceView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v && VALID_VIEWS.includes(v)) return v as ActiveWorkspaceView;
  } catch {
    // ignore
  }
  return 'planner';
}

function loadInitialState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return {
        tourTitle: parsed.tourTitle || '',
        days: Array.isArray(parsed.days) ? parsed.days : [],
        activeDayId: parsed.activeDayId || null,
        activeRegion: parsed.activeRegion || 'Tümü',
        activeCity: parsed.activeCity || 'Tümü',
        activeCategory: parsed.activeCategory || 'Tümü',
        customPlaces: Array.isArray(parsed.customPlaces) ? parsed.customPlaces : [],
        editedPlaces: parsed.editedPlaces || {},
        deletedPlaceIds: Array.isArray(parsed.deletedPlaceIds) ? parsed.deletedPlaceIds : [],
        customCities: Array.isArray(parsed.customCities) ? parsed.customCities : [],
        savedTemplates: Array.isArray(parsed.savedTemplates) ? parsed.savedTemplates : [],
        dirtyCities: Array.isArray(parsed.dirtyCities) ? parsed.dirtyCities : [],
      };
    }
  } catch {
    // ignore
  }

  return {
    tourTitle: '',
    days: [],
    activeDayId: null,
    activeRegion: 'Tümü',
    activeCity: 'Tümü',
    activeCategory: 'Tümü',
    customPlaces: [],
    editedPlaces: {},
    deletedPlaceIds: [],
    customCities: [],
    savedTemplates: [],
    dirtyCities: [],
  };
}

// ---- Arşiv (JSON) yardımcıları ----

/** Dosyadan okunan günleri uygulamanın beklediği biçime çevirir. */
function normalizeImportedDays(rawDays: unknown, keepIds: boolean): TourDay[] {
  if (!Array.isArray(rawDays)) return [];
  const stamp = Date.now();
  return rawDays.map((d: Partial<TourDay>, idx: number) => {
    const places: Place[] = (Array.isArray(d.places) ? d.places : []).map(
      (p: Place, pIdx: number) => ({
        ...p,
        id: p.id || `imp-${stamp}-${idx}-${pIdx}`,
        city: sanitizeCityName(p.city),
        // Listede olmayan, elle yazılmış kategoriler kaybolmasın
        category: normalizeTag(p.category) || p.category || '#tarih',
      })
    );
    return {
      id: keepIds && d.id ? d.id : `day-${keepIds ? 'imp' : 'merged'}-${stamp}-${idx}`,
      title: d.title || `${idx + 1}. Gün`,
      places,
      transits: buildDayTransits(places, Array.isArray(d.transits) ? d.transits : undefined),
      customTimes: d.customTimes && typeof d.customTimes === 'object' ? d.customTimes : {},
    };
  });
}

/** İki listeyi id'ye göre tekrarsız birleştirir (mevcut kayıt korunur). */
function mergeUniqueById<T extends { id: string }>(base: T[], extra: unknown): T[] {
  if (!Array.isArray(extra)) return base;
  const seen = new Set(base.map((b) => b.id));
  const added = (extra as T[]).filter((x) => x && x.id && !seen.has(x.id));
  return [...base, ...added];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export default function App() {
  const [state, setState] = useState<PersistedState>(loadInitialState);
  const stateRef = useRef(state);
  const saveErrorShownRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<ActiveWorkspaceView>(loadInitialView);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isCloudConfigured);
  const [cloudReady, setCloudReady] = useState(!isCloudConfigured);
  const [cloudLoadError, setCloudLoadError] = useState('');
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cloudLoadAttempt, setCloudLoadAttempt] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setCloudLoadError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!mounted) return;
      setCloudLoadError(error instanceof Error ? error.message : 'Oturum kontrol edilemedi.');
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCloudLoadError('');
      if (!nextSession) setCloudReady(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setCloudReady(false);
      return;
    }
    let cancelled = false;
    setCloudReady(false);
    setCloudLoadError('');
    loadPlannerState(session.user.id).then(async (remoteState) => {
      if (cancelled) return;
      if (remoteState) {
        const normalized = { ...remoteState, dirtyCities: [] } as PersistedState;
        setState(normalized);
        saveStateToStorage(normalized);
      } else {
        // First login: migrate this browser's existing planner data to the cloud.
        await savePlannerState(session.user.id, { ...stateRef.current, dirtyCities: [] });
      }
      if (!cancelled) {
        setCloudSaveStatus('saved');
        setCloudReady(true);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setCloudLoadError(error instanceof Error ? error.message : 'Bulut kaydı yüklenemedi.');
        setCloudReady(false);
      }
    });
    return () => { cancelled = true; };
  }, [session?.user.id, cloudLoadAttempt]);

  // Modals & transient UI states
  const [guideTarget, setGuideTarget] = useState<{ placeName: string; city: string } | null>(
    null
  );
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [hasCustomApiKey, setHasCustomApiKey] = useState<boolean>(() => Boolean(getStoredApiKey()));
  const [measureFirstPlace, setMeasureFirstPlace] = useState<Place | null>(null);
  const [distanceModalResult, setDistanceModalResult] = useState<{
    from: string;
    to: string;
    roadKm: number;
    driveMins: number;
  } | null>(null);
  const [quickPresetLoadingId, setQuickPresetLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sunucuda (catalog-data/<şehir>.json) şehir şehir kayıtlı kataloglar
  const [serverCatalog, setServerCatalog] = useState<Record<string, Place[]>>({});
  const [savingCatalog, setSavingCatalog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchServerCatalog().then((loaded) => {
      if (!cancelled && loaded) setServerCatalog(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save locally immediately and debounce a complete cloud sync.
  const cloudErrorShownRef = useRef(false);
  useEffect(() => {
    stateRef.current = state;
    const ok = saveStateToStorage(state);
    if (ok) {
      saveErrorShownRef.current = false;
      setLastSavedAt(new Date());
    } else if (!saveErrorShownRef.current) {
      saveErrorShownRef.current = true;
      showToast('Otomatik kayıt yapılamadı. Lütfen "Arşivle (.json)" ile yedek alın.');
    }

    if (!supabase || !session || !cloudReady) return;
    const snapshot: PersistedState = { ...state, dirtyCities: [] };
    const timer = window.setTimeout(async () => {
      setCloudSaveStatus('saving');
      try {
        await savePlannerState(session.user.id, snapshot);
        setCloudSaveStatus('saved');
        cloudErrorShownRef.current = false;
        if (state.dirtyCities.length > 0) {
          setState((prev) => prev.dirtyCities.length ? { ...prev, dirtyCities: [] } : prev);
        }
      } catch (error) {
        setCloudSaveStatus('error');
        if (!cloudErrorShownRef.current) {
          cloudErrorShownRef.current = true;
          showToast(error instanceof Error
            ? `Buluta kaydedilemedi: ${error.message}. Bağlantıyı kontrol edip Kaydet'e basın.`
            : 'Buluta kaydedilemedi. Bağlantıyı kontrol edip Kaydet\'e basın.');
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [state, session?.user.id, cloudReady]);
  // Sekme kapanırken / arka plana giderken son durumu garantiye al
  useEffect(() => {
    const flush = () => {
      saveStateToStorage(stateRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Tarayıcıdan verinin kendiliğinden silinmemesini iste
  useEffect(() => {
    navigator.storage?.persist?.()?.catch(() => {});
  }, []);

  // Açık ekranı (planlayıcı / atlas / rapor...) hatırla
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, activeView);
    } catch {
      // ignore
    }
  }, [activeView]);

  function showToast(msg: string) {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3800);
  }

  const catalogPlaces = useMemo(() => {
    const deletedSet = new Set(state.deletedPlaceIds);

    // Sunucuda dosyası olan şehirlerde temel katalog o dosyadır; diğerlerinde kodla gelen katalog
    const serverCityNames = new Set(Object.keys(serverCatalog));
    const fromServer = Object.values(serverCatalog).flat();
    const fromInitial = INITIAL_TURKEY_CATALOG.filter((p) => !serverCityNames.has(p.city));

    const seen = new Set<string>();
    const base: Place[] = [];
    for (const p of [...fromServer, ...fromInitial]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      base.push(p);
    }

    const baseFinal = base
      .filter((p) => !deletedSet.has(p.id))
      .map((p) => state.editedPlaces[p.id] || p);
    const customs = state.customPlaces
      .filter((p) => !deletedSet.has(p.id) && !seen.has(p.id))
      .map((p) => state.editedPlaces[p.id] || p);
    return [...customs, ...baseFinal];
  }, [serverCatalog, state.customPlaces, state.editedPlaces, state.deletedPlaceIds]);

  // Rehber kartı açılan mekânın katalogdaki karşılığı (ad + şehir ile eşleşir)
  const guidePlace = useMemo(() => {
    if (!guideTarget) return undefined;
    const norm = (v: string) => v.trim().toLocaleLowerCase('tr-TR');
    return catalogPlaces.find(
      (p) => norm(p.name) === norm(guideTarget.placeName) && p.city === guideTarget.city
    );
  }, [guideTarget, catalogPlaces]);

  // Bekleyen her katalog değişikliğinin şehri "kaydedilmemiş" olarak işaretlenir
  useEffect(() => {
    const cities = overlayCities(state.customPlaces, state.editedPlaces, state.deletedPlaceIds);
    const missing = cities.filter((c) => !state.dirtyCities.includes(c));
    if (missing.length > 0) {
      setState((prev) => ({
        ...prev,
        dirtyCities: Array.from(new Set([...prev.dirtyCities, ...missing])),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.customPlaces, state.editedPlaces, state.deletedPlaceIds]);

  const allCities = useMemo(() => {
    const baseNames = PROVINCES_81.map((p) => p.name);
    const extras = state.customCities.filter((c) => !baseNames.includes(c));
    return [...baseNames, ...extras];
  }, [state.customCities]);

  function handleMeasureDistance(place: Place) {
    if (!measureFirstPlace) {
      setMeasureFirstPlace(place);
      showToast(`Sabit nokta belirlendi: ${place.name}`);
      return;
    }
    if (measureFirstPlace.id === place.id) {
      setMeasureFirstPlace(null);
      showToast('Ölçüm modu kapatıldı.');
      return;
    }
    const { roadKm, driveMins } = calculatePairDistance(measureFirstPlace, place);
    setDistanceModalResult({
      from: `${measureFirstPlace.name} (${measureFirstPlace.city})`,
      to: `${place.name} (${place.city})`,
      roadKm: Math.round(roadKm * 10) / 10,
      driveMins,
    });
  }

  function handleAddNewDay() {
    const newDayId = `day-${Date.now()}`;
    const newDay: TourDay = {
      id: newDayId,
      title: state.activeCity !== 'Tümü' ? `${state.activeCity} Gezisi` : 'Yeni Gün',
      places: [],
      transits: [],
      customTimes: {},
    };
    setState((prev) => ({
      ...prev,
      days: [...prev.days, newDay],
      activeDayId: newDayId,
    }));
  }

  function handleAddPlaceToDay(place: Place) {
    setState((prev) => {
      let updatedDays = [...prev.days];
      let targetDayId = prev.activeDayId;

      if (updatedDays.length === 0) {
        const freshId = `day-${Date.now()}`;
        updatedDays = [
          {
            id: freshId,
            title: `${place.city} Rotası`,
            places: [],
            transits: [],
            customTimes: {},
          },
        ];
        targetDayId = freshId;
      }

      const idx = updatedDays.findIndex((d) => d.id === targetDayId);
      const safeIdx = idx >= 0 ? idx : 0;
      const targetDay = updatedDays[safeIdx];

      const clonedPlace: Place = {
        ...place,
        id: `${place.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      const nextPlaces = [...targetDay.places, clonedPlace];
      const nextTitle =
        targetDay.title === 'Yeni Gün' && nextPlaces.length === 1
          ? `${place.city} Rotası`
          : targetDay.title;

      updatedDays[safeIdx] = {
        ...targetDay,
        title: nextTitle,
        places: nextPlaces,
        transits: buildDayTransits(nextPlaces, targetDay.transits),
      };

      return {
        ...prev,
        days: updatedDays,
        activeDayId: updatedDays[safeIdx].id,
      };
    });

    if (activeView === 'turkey-atlas') {
      showToast(`"${place.name}" aktif güne eklendi.`);
    }
  }

  function handleAddBatchToDay(places: Place[], groupTitle?: string) {
    if (places.length === 0) return;
    const newDayId = `day-${Date.now()}`;
    const cloned = places.map((p, i) => ({
      ...p,
      id: `${p.id}-${Date.now()}-${i}`,
    }));
    const newDay: TourDay = {
      id: newDayId,
      title: groupTitle || `${places[0].city} Gezisi`,
      places: cloned,
      transits: recalculateAllDayTransits(cloned),
      customTimes: {},
    };
    setState((prev) => ({
      ...prev,
      days: [...prev.days, newDay],
      activeDayId: newDayId,
    }));
    setActiveView('planner');
    showToast(`${places.length} durak yeni gün olarak programa aktarıldı.`);
  }

  function handleDropCatalogPlaceOnDay(
    catalogPlaceId: string,
    toDayId: string,
    toIdx?: number
  ) {
    const orig = catalogPlaces.find((p) => p.id === catalogPlaceId);
    if (!orig) return;

    setState((prev) => {
      const daysCopy = prev.days.map((d) => {
        if (d.id !== toDayId) return d;
        const nextPlaces = [...d.places];
        const cloned: Place = { ...orig, id: `${orig.id}-${Date.now()}` };
        if (typeof toIdx === 'number') {
          nextPlaces.splice(toIdx, 0, cloned);
        } else {
          nextPlaces.push(cloned);
        }
        return {
          ...d,
          title: d.title === 'Yeni Gün' ? `${orig.city} Rotası` : d.title,
          places: nextPlaces,
          transits: recalculateAllDayTransits(nextPlaces),
          customTimes: {},
        };
      });
      return { ...prev, days: daysCopy, activeDayId: toDayId };
    });
  }

  function handleMovePlaceInDay(dayId: string, fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d) => {
        if (d.id !== dayId) return d;
        if (toIdx < 0 || toIdx >= d.places.length) return d;
        const nextPlaces = [...d.places];
        const [moved] = nextPlaces.splice(fromIdx, 1);
        nextPlaces.splice(toIdx, 0, moved);
        const updatedTransits = recalculateAllDayTransits(nextPlaces);

        return {
          ...d,
          places: nextPlaces,
          transits: updatedTransits,
          customTimes: {},
        };
      }),
    }));
  }

  function handleMovePlaceAcrossDays(
    fromDayId: string,
    fromIdx: number,
    toDayId: string,
    toIdx?: number
  ) {
    if (fromDayId === toDayId) {
      if (typeof toIdx === 'number') handleMovePlaceInDay(fromDayId, fromIdx, toIdx);
      return;
    }

    setState((prev) => {
      const fromDay = prev.days.find((d) => d.id === fromDayId);
      const movedPlace = fromDay?.places[fromIdx];
      if (!movedPlace) return prev;

      const updatedDays = prev.days.map((d) => {
        if (d.id === fromDayId) {
          const nextPlaces = d.places.filter((_, idx) => idx !== fromIdx);
          return {
            ...d,
            places: nextPlaces,
            transits: recalculateAllDayTransits(nextPlaces),
            customTimes: {},
          };
        }
        if (d.id === toDayId) {
          const nextPlaces = [...d.places];
          if (typeof toIdx === 'number') {
            nextPlaces.splice(toIdx, 0, movedPlace);
          } else {
            nextPlaces.push(movedPlace);
          }
          return {
            ...d,
            places: nextPlaces,
            transits: recalculateAllDayTransits(nextPlaces),
            customTimes: {},
          };
        }
        return d;
      });

      return { ...prev, days: updatedDays, activeDayId: toDayId };
    });
  }

  function handleApplyOptimizedDay(
    dayId: string,
    orderedIds: string[],
    startTimes: string[]
  ) {
    setState((prev) => ({
      ...prev,
      days: prev.days.map((d) => {
        if (d.id !== dayId) return d;
        if (d.places.length <= 2) return d;

        const firstPlace = d.places[0];
        const lastPlace = d.places.length > 2 ? d.places[d.places.length - 1] : null;
        const middlePlaces = d.places.slice(1, lastPlace ? -1 : undefined);

        const middleMap = new Map(middlePlaces.map((p) => [p.id, p]));
        const nameMap = new Map(middlePlaces.map((p) => [p.name.trim().toLowerCase(), p]));

        const reorderedMiddle: Place[] = [];

        for (const target of orderedIds) {
          let found = middleMap.get(target) || nameMap.get(target.trim().toLowerCase());
          if (found && found.id !== firstPlace.id && (!lastPlace || found.id !== lastPlace.id)) {
            if (!reorderedMiddle.includes(found)) {
              reorderedMiddle.push(found);
              middleMap.delete(found.id);
            }
          }
        }

        for (const leftover of middleMap.values()) {
          reorderedMiddle.push(leftover);
        }

        const finalPlaces: Place[] = [
          firstPlace,
          ...reorderedMiddle,
          ...(lastPlace ? [lastPlace] : []),
        ];

        const customTimes: Record<number, string> = {};
        if (startTimes[0] && /^\d{2}:\d{2}$/.test(startTimes[0])) {
          customTimes[0] = startTimes[0];
        }

        return {
          ...d,
          places: finalPlaces,
          transits: recalculateAllDayTransits(finalPlaces),
          customTimes,
        };
      }),
    }));
  }

  function handleAddSuggestedStopToDay(dayId: string, stop: AiGeneratedStop) {
    // ItineraryBoard'daki "+ Ekle" formundan gelen manuel duraklarda id "manual-" ile başlar
    const rawId = (stop as unknown as Partial<Place>).id || '';
    const isManual = rawId.startsWith('manual-');

    const rawCity = (stop.city || '').trim();
    const cleanCity = isManual && !rawCity ? 'Genel' : sanitizeCityName(stop.city);
    const province = PROVINCE_BY_NAME[cleanCity];
    const rawCategory = (stop.category || '').trim();

    let newStop: Place;

    if (isManual) {
      // Kullanıcının yazdığı kategori korunur; koordinat yoksa şehir biliniyorsa il merkezi,
      // bilinmiyorsa 0 (koordinatsız) kalır ve geçişlere uydurma mesafe yazılmaz.
      const normalized = rawCategory.startsWith('#') ? normalizeTag(rawCategory) : '';
      const hasOwnCoords = Boolean(Number(stop.lat) && Number(stop.lng));
      newStop = {
        id: `${rawId}-${Math.random().toString(36).slice(2, 6)}`,
        name: stop.name,
        city: cleanCity,
        region: province?.region,
        category: normalized || rawCategory || '#tarih',
        duration: Math.max(0, Number(stop.duration) || 45),
        tip: stop.tip || '',
        lat: hasOwnCoords ? Number(stop.lat) : province?.lat ?? 0,
        lng: hasOwnCoords ? Number(stop.lng) : province?.lng ?? 0,
      };
    } else {
      newStop = {
        id: `ai-stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: stop.name,
        city: cleanCity,
        region: province?.region,
        category: normalizeTag(stop.category) || '#tarih',
        duration: Math.max(15, Number(stop.duration) || 60),
        tip: stop.tip || '',
        lat: Number(stop.lat) || province?.lat || 39.0,
        lng: Number(stop.lng) || province?.lng || 35.0,
      };
    }

    setState((prev) => ({
      ...prev,
      days: prev.days.map((d) => {
        if (d.id !== dayId) return d;
        const nextPlaces = [...d.places, newStop];
        return {
          ...d,
          places: nextPlaces,
          // Mevcut (elle düzenlenmiş) geçişleri koru, sadece yeni durağın geçişini hesapla
          transits: buildDayTransits(nextPlaces, d.transits),
        };
      }),
    }));
    showToast(`"${stop.name}" güne eklendi.`);
  }

  function convertWizardResultToDays(result: AiWizardResponse): TourDay[] {
    return result.days.map((genDay, dIdx) => {
      const customTimes: Record<number, string> = {};
      const places: Place[] = genDay.stops.map((s, sIdx) => {
        const cleanCity = sanitizeCityName(s.city);
        if (sIdx === 0 && s.startTime && /^\d{2}:\d{2}$/.test(s.startTime)) {
          customTimes[0] = s.startTime;
        }
        return {
          id: `ai-gen-${Date.now()}-${dIdx}-${sIdx}`,
          name: s.name,
          city: cleanCity,
          region: PROVINCE_BY_NAME[cleanCity]?.region,
          category: normalizeTag(s.category) || '#tarih',
          duration: Math.max(0, Number(s.duration) || 60),
          tip: s.tip || '',
          lat: Number(s.lat) || PROVINCE_BY_NAME[cleanCity]?.lat || 39.0,
          lng: Number(s.lng) || PROVINCE_BY_NAME[cleanCity]?.lng || 35.0,
        };
      });

      return {
        id: `day-ai-${Date.now()}-${dIdx}`,
        title: genDay.title,
        places,
        transits: recalculateAllDayTransits(places),
        customTimes,
      };
    });
  }

  function handleApplyGeneratedTour(result: AiWizardResponse, appendMode: boolean) {
    const generatedDays = convertWizardResultToDays(result);
    if (generatedDays.length === 0) return;

    setState((prev) => ({
      ...prev,
      tourTitle: appendMode && prev.tourTitle ? prev.tourTitle : result.tourTitle,
      days: appendMode ? [...prev.days, ...generatedDays] : generatedDays,
      activeDayId: generatedDays[0].id,
    }));
    setActiveView('planner');
    showToast(`"${result.tourTitle}" (${generatedDays.length} gün) programa aktarıldı.`);
  }

  async function handleRunQuickPreset(preset: QuickPresetRoute) {
    setQuickPresetLoadingId(preset.id);
    try {
      const catalogSample = catalogPlaces
        .filter((p) => preset.cities.includes(p.city))
        .map((p) => ({
          name: p.name,
          city: p.city,
          category: p.category,
          duration: p.duration,
          lat: p.lat,
          lng: p.lng,
          tip: p.tip,
        }));

      const res = await fetch('/api/ai/generate-itinerary', {
        method: 'POST',
        headers: getAiHeaders(),
        body: JSON.stringify({
          cities: preset.cities,
          dayCount: preset.dayCount,
          tempo: preset.tempo,
          categories: preset.categories,
          notes: preset.notes,
          catalogSample,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Şablon oluşturulamadı.');

      handleApplyGeneratedTour(data as AiWizardResponse, false);
    } catch (err) {
      showToast((err as Error).message || 'AI rota üretimi başarısız oldu.');
    } finally {
      setQuickPresetLoadingId(null);
    }
  }

  // ---- Kaydet butonu (ve Ctrl+S) ----
  const saveHandlerRef = useRef<() => unknown>(() => undefined);
  const savingCatalogRef = useRef(false);

  async function handleManualSave() {
    if (supabase && session) {
      if (!cloudReady) {
        showToast('Bulut kaydı henüz hazır değil. Biraz bekleyip tekrar deneyin.');
        return;
      }
      try {
        const snapshot = { ...stateRef.current, dirtyCities: [] };
        await savePlannerState(session.user.id, snapshot);
        setState((prev) => prev.dirtyCities.length ? { ...prev, dirtyCities: [] } : prev);
        setCloudSaveStatus('saved');
        setLastSavedAt(new Date());
        showToast('Tüm bilgiler hesabınıza güvenli biçimde kaydedildi.');
      } catch (error) {
        setCloudSaveStatus('error');
        showToast(error instanceof Error ? `Buluta kaydedilemedi: ${error.message}` : 'Buluta kaydedilemedi. Tekrar deneyin.');
      }
      return;
    }
    // 1) Tarayıcıdaki çalışma kaydı
    const localOk = saveStateToStorage(stateRef.current);
    if (localOk) setLastSavedAt(new Date());

    // 2) Değişiklik olan şehirlerin katalogları: şehir başına ayrı dosya
    const dirty = Array.from(new Set(state.dirtyCities));
    if (dirty.length === 0) {
      showToast(
        localOk
          ? 'Tüm veriler kaydedildi.'
          : 'Kaydedilemedi (tarayıcı depolama alanı dolu veya kapalı). Lütfen "Arşivle (.json)" ile yedek alın.'
      );
      return;
    }
    if (savingCatalogRef.current) return;
    savingCatalogRef.current = true;
    setSavingCatalog(true);

    try {
      const results = await Promise.all(
        dirty.map(async (city) => {
          const places = catalogPlaces.filter((p) => p.city === city);
          const ok = await saveCityCatalog(city, PROVINCE_BY_NAME[city]?.plate, places);
          return { city, places, ok };
        })
      );

      const saved = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      if (saved.length > 0) {
        setServerCatalog((prev) => {
          const next = { ...prev };
          saved.forEach((r) => {
            next[r.city] = r.places;
          });
          return next;
        });

        const savedSet = new Set(saved.map((r) => r.city));
        setState((prev) => {
          // Kaydetme sırasında yeni bir katalog değişikliği yapıldıysa dokunma (sonraki Kaydet'te işlenir)
          const unchanged =
            prev.customPlaces === state.customPlaces &&
            prev.editedPlaces === state.editedPlaces &&
            prev.deletedPlaceIds === state.deletedPlaceIds;
          if (!unchanged) return prev;

          const remainingDirty = prev.dirtyCities.filter((c) => !savedSet.has(c));
          const overlayLeft = overlayCities(
            prev.customPlaces,
            prev.editedPlaces,
            prev.deletedPlaceIds
          ).filter((c) => !savedSet.has(c));

          if (remainingDirty.length === 0 && overlayLeft.length === 0) {
            // Her şey şehir dosyalarına işlendi: tarayıcıdaki geçici katman temizlenir
            return {
              ...prev,
              customPlaces: [],
              editedPlaces: {},
              deletedPlaceIds: [],
              dirtyCities: [],
            };
          }
          return { ...prev, dirtyCities: remainingDirty };
        });
      }

      if (failed.length === 0) {
        showToast(`Kaydedildi. Katalogu güncellenen şehirler: ${saved.map((r) => r.city).join(', ')}`);
      } else {
        showToast(
          `Katalog dosyası yazılamadı: ${failed.map((r) => r.city).join(', ')}. Sunucu çalışıyor mu? Veriler tarayıcıda duruyor, tekrar "Kaydet"e basabilirsiniz.`
        );
      }
    } finally {
      savingCatalogRef.current = false;
      setSavingCatalog(false);
    }
  }
  saveHandlerRef.current = handleManualSave;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveHandlerRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---- Katalog kartı değişiklikleri (şehir "kaydedilmemiş" olarak işaretlenir) ----
  function handleUpdateCatalogPlace(updated: Place) {
    const before = catalogPlaces.find((p) => p.id === updated.id);
    setState((prev) => ({
      ...prev,
      editedPlaces: { ...prev.editedPlaces, [updated.id]: updated },
      dirtyCities: Array.from(
        new Set([...prev.dirtyCities, ...[before?.city, updated.city].filter((c): c is string => Boolean(c))])
      ),
    }));
  }

  function handleDeleteCatalogPlace(id: string) {
    const city = catalogPlaces.find((p) => p.id === id)?.city;
    setState((prev) => ({
      ...prev,
      deletedPlaceIds: [...prev.deletedPlaceIds, id],
      dirtyCities: city ? Array.from(new Set([...prev.dirtyCities, city])) : prev.dirtyCities,
    }));
  }

  // Rehber kartı bilgisi katalogdaki mekân kartına yazılır
  function handleSaveGuide(note: AiGuideNote) {
    if (!guidePlace) return;
    handleUpdateCatalogPlace({ ...guidePlace, guide: note });
  }

  // ---- Şablonlar (tek tıkla kaydet / geri yükle) ----
  function handleSaveTemplate() {
    if (!state.days.some((d) => d.places.length > 0)) {
      showToast('Şablon kaydetmek için önce programa en az bir durak ekleyin.');
      return;
    }
    const now = new Date();
    const stamp = now.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const template: SavedTemplate = {
      id: `tpl-${Date.now()}`,
      name: `${state.tourTitle.trim() || 'Adsız Tur'} · ${stamp}`,
      createdAt: now.toISOString(),
      tourTitle: state.tourTitle,
      days: JSON.parse(JSON.stringify(state.days)) as TourDay[],
    };
    setState((prev) => ({ ...prev, savedTemplates: [template, ...prev.savedTemplates] }));
    showToast(`Şablon kaydedildi: "${template.name}"`);
  }

  function handleLoadTemplate(templateId: string, mode: 'replace' | 'append') {
    const tpl = state.savedTemplates.find((t) => t.id === templateId);
    if (!tpl) return;

    const stamp = Date.now();
    const loadedDays = (JSON.parse(JSON.stringify(tpl.days)) as TourDay[]).map((d, i) => ({
      ...d,
      id: `day-tpl-${stamp}-${i}`,
    }));
    if (loadedDays.length === 0) return;

    setState((prev) => ({
      ...prev,
      tourTitle: mode === 'append' && prev.tourTitle ? prev.tourTitle : tpl.tourTitle,
      days: mode === 'append' ? [...prev.days, ...loadedDays] : loadedDays,
      activeDayId: loadedDays[0].id,
    }));
    setActiveView('planner');
    showToast(
      mode === 'append'
        ? `"${tpl.name}" mevcut programın sonuna eklendi.`
        : `"${tpl.name}" şablonu yüklendi.`
    );
  }

  function handleDeleteTemplate(templateId: string) {
    setState((prev) => ({
      ...prev,
      savedTemplates: prev.savedTemplates.filter((t) => t.id !== templateId),
    }));
    showToast('Şablon silindi.');
  }

  function handleExportJson() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    const payload = {
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      tourTitle: state.tourTitle,
      days: state.days,
      activeDayId: state.activeDayId,
      activeRegion: state.activeRegion,
      activeCity: state.activeCity,
      activeCategory: state.activeCategory,
      customPlaces: state.customPlaces,
      editedPlaces: state.editedPlaces,
      deletedPlaceIds: state.deletedPlaceIds,
      customCities: state.customCities,
      savedTemplates: state.savedTemplates,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (state.tourTitle || 'rota81_tam_arsiv')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    a.download = `${safeTitle}_${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Tüm tur arşivi ve rehber kartı düzenlemeleri (.json) indirildi.');
  }

  function handleImportJson(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || '{}'));
        if (!isPlainObject(parsed)) throw new Error('invalid');

        const importedDays = normalizeImportedDays(parsed.days, true);

        setState((prev) => {
          const requestedActive = typeof parsed.activeDayId === 'string' ? parsed.activeDayId : null;
          const activeDayId =
            requestedActive && importedDays.some((d) => d.id === requestedActive)
              ? requestedActive
              : importedDays[0]?.id || null;

          return {
            ...prev,
            // Yeni format: tourTitle, eski format: title
            tourTitle:
              typeof parsed.tourTitle === 'string'
                ? parsed.tourTitle
                : typeof parsed.title === 'string'
                ? parsed.title
                : prev.tourTitle,
            days: importedDays,
            activeDayId,
            activeRegion: (parsed.activeRegion as PersistedState['activeRegion']) || prev.activeRegion,
            activeCity: typeof parsed.activeCity === 'string' ? parsed.activeCity : prev.activeCity,
            activeCategory:
              typeof parsed.activeCategory === 'string' ? parsed.activeCategory : prev.activeCategory,
            // Dosyada varsa birebir geri yükle (çoğalma olmasın), yoksa mevcut kalsın
            customPlaces: Array.isArray(parsed.customPlaces)
              ? (parsed.customPlaces as Place[])
              : prev.customPlaces,
            editedPlaces: isPlainObject(parsed.editedPlaces)
              ? (parsed.editedPlaces as Record<string, Place>)
              : prev.editedPlaces,
            deletedPlaceIds: Array.isArray(parsed.deletedPlaceIds)
              ? (parsed.deletedPlaceIds as string[])
              : prev.deletedPlaceIds,
            customCities: Array.isArray(parsed.customCities)
              ? (parsed.customCities as string[])
              : prev.customCities,
            savedTemplates: Array.isArray(parsed.savedTemplates)
              ? (parsed.savedTemplates as SavedTemplate[])
              : prev.savedTemplates,
          };
        });
        showToast('Kayıtlı proje başarıyla yüklendi.');
      } catch {
        showToast('Geçersiz veya okunamayan .json dosyası.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleMergeJson(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || '{}'));
        if (!isPlainObject(parsed)) throw new Error('invalid');

        const mergedDays = normalizeImportedDays(parsed.days, false).map((d, idx) => ({
          ...d,
          title: `[Birleşen] ${d.title || `${idx + 1}. Gün`}`,
        }));

        setState((prev) => ({
          ...prev,
          days: [...prev.days, ...mergedDays],
          activeDayId: prev.activeDayId || mergedDays[0]?.id || null,
          // Günlerdeki özel mekânlar ve şehirler de gelsin; mevcut kayıtlar ezilmesin
          customPlaces: mergeUniqueById(prev.customPlaces, parsed.customPlaces),
          customCities: Array.isArray(parsed.customCities)
            ? Array.from(new Set([...prev.customCities, ...(parsed.customCities as string[])]))
            : prev.customCities,
          editedPlaces: isPlainObject(parsed.editedPlaces)
            ? { ...(parsed.editedPlaces as Record<string, Place>), ...prev.editedPlaces }
            : prev.editedPlaces,
          savedTemplates: mergeUniqueById(prev.savedTemplates, parsed.savedTemplates),
        }));
        showToast(`${mergedDays.length} gün mevcut tura birleştirildi.`);
      } catch {
        showToast('Birleştirme sırasında dosya okuma hatası oluştu.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function handleDownloadReport() {
    if (state.days.length === 0) {
      showToast('Rapor indirmek için önce en az 1 gün ekleyin.');
      return;
    }
    const html = generatePrintableHtml(state.tourTitle, state.days);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.tourTitle || 'Tur_Rotasi').replace(/\s+/g, '_')}_Raporu.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Yazdırılabilir rapor (.html) indirildi.');
  }

  if (isCloudConfigured && authLoading) {
    return <main className="min-h-screen flex items-center justify-center bg-stone-50 text-sm text-slate-600">Bulut hesabınız kontrol ediliyor…</main>;
  }
  if (isCloudConfigured && !session) return <CloudAccess />;
  if (isCloudConfigured && session && !cloudReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-50 p-4 text-slate-900">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
          <h1 className="text-lg font-bold">Kayıtlarınız yükleniyor</h1>
          {cloudLoadError ? (
            <>
              <p className="mt-3 text-sm leading-6 text-rose-700">{cloudLoadError}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Verilerinizin üzerine yazmamak için kayıtlar yüklenene kadar uygulamayı açmadık. Supabase SQL kurulumunun tamamlandığını ve internet bağlantısını kontrol edin.</p>
              <button type="button" onClick={() => setCloudLoadAttempt((n) => n + 1)} className="mt-5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Tekrar dene</button>
            </>
          ) : <p className="mt-2 text-sm text-slate-600">Mevcut kayıtlar güvenle eşitleniyor…</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-slate-900">
      <TopNav
        activeView={activeView}
        onChangeView={setActiveView}
        onOpenCustomPlace={() => setCustomModalOpen(true)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
        hasCustomApiKey={hasCustomApiKey}
      />

      {/* Non-blocking Toast Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-3 no-print">
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Otomatik kayıt göstergesi */}
      {(lastSavedAt || savingCatalog || state.dirtyCities.length > 0 || isCloudConfigured) && (
        <div className="fixed bottom-5 left-5 z-40 max-w-[420px] text-[11px] text-slate-500 bg-white/90 border border-slate-200 rounded-md px-2.5 py-1 shadow-sm no-print space-y-0.5">
          {lastSavedAt && (
            <div>
              ✓ Otomatik kaydedildi ·{' '}
              {lastSavedAt.toLocaleTimeString('tr-TR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
          )}
          {isCloudConfigured && session && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-1">
              <span className={cloudSaveStatus === 'error' ? 'text-rose-700' : cloudSaveStatus === 'saving' ? 'text-amber-700' : 'text-emerald-700'}>
                {cloudSaveStatus === 'saving' ? 'Buluta kaydediliyor…' : cloudSaveStatus === 'error' ? 'Bulut kaydı başarısız' : cloudSaveStatus === 'saved' ? 'Buluta kaydedildi' : 'Bulut senkronizasyonu etkin'}
              </span>
              <button type="button" onClick={() => { void supabase?.auth.signOut(); }} className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900" title={session.user.email || 'Oturumu kapat'}>
                <LogOut className="h-3 w-3" /> Çıkış
              </button>
            </div>
          )}
          {!isCloudConfigured && (
            <div className="text-amber-800">Yalnızca bu tarayıcıya kaydediliyor; bulut için Supabase ayarları gerekli.</div>
          )}
          {savingCatalog && (
            <div className="text-amber-700">Katalog şehir şehir kaydediliyor…</div>
          )}
          {!savingCatalog && state.dirtyCities.length > 0 && (
            <div className="text-amber-800">
              Katalog dosyası bekleyen şehirler: {state.dirtyCities.join(', ')} — "Kaydet"e basın
            </div>
          )}
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 py-5 flex-1">
        {activeView === 'planner' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <CatalogPanel
                catalogPlaces={catalogPlaces}
                cities={allCities}
                activeRegion={state.activeRegion}
                onChangeRegion={(r) => setState((prev) => ({ ...prev, activeRegion: r }))}
                activeCity={state.activeCity}
                onChangeCity={(c) => setState((prev) => ({ ...prev, activeCity: c }))}
                activeCategory={state.activeCategory}
                onChangeCategory={(cat) =>
                  setState((prev) => ({ ...prev, activeCategory: cat }))
                }
                onAddPlaceToDay={handleAddPlaceToDay}
                onAddBatchToDay={handleAddBatchToDay}
                onOpenAiGuide={(placeName, city) => setGuideTarget({ placeName, city })}
                onMeasureDistance={handleMeasureDistance}
                measureFirstPlace={measureFirstPlace}
                onCancelMeasure={() => setMeasureFirstPlace(null)}
                onUpdateCatalogPlace={handleUpdateCatalogPlace}
                onDeleteCatalogPlace={handleDeleteCatalogPlace}
                onAddCity={(rawName) => {
                  const clean = sanitizeCityName(rawName);
                  setState((prev) => ({
                    ...prev,
                    customCities: prev.customCities.includes(clean)
                      ? prev.customCities
                      : [...prev.customCities, clean],
                    activeCity: clean,
                  }));
                  showToast(`"${clean}" şehir listesine eklendi.`);
                }}
              />
            </div>

            <div className="lg:col-span-7">
              <ItineraryBoard
                tourTitle={state.tourTitle}
                onChangeTourTitle={(val) => setState((prev) => ({ ...prev, tourTitle: val }))}
                days={state.days}
                activeDayId={state.activeDayId}
                onSelectActiveDay={(id) => setState((prev) => ({ ...prev, activeDayId: id }))}
                onAddNewDay={handleAddNewDay}
                onRemoveDay={(dayId) =>
                  setState((prev) => {
                    const filtered = prev.days.filter((d) => d.id !== dayId);
                    return {
                      ...prev,
                      days: filtered,
                      activeDayId:
                        prev.activeDayId === dayId
                          ? filtered[0]?.id || null
                          : prev.activeDayId,
                    };
                  })
                }
                onClearAllDays={() =>
                  setState((prev) => ({ ...prev, days: [], activeDayId: null }))
                }
                onResetToFactory={() => {
                  localStorage.removeItem(STORAGE_KEY);
                  setState((prev) => ({
                    savedTemplates: prev.savedTemplates,
                    dirtyCities: [],
                    tourTitle: '',
                    days: [],
                    activeDayId: null,
                    activeRegion: 'Tümü',
                    activeCity: 'Tümü',
                    activeCategory: 'Tümü',
                    customPlaces: [],
                    editedPlaces: {},
                    deletedPlaceIds: [],
                    customCities: [],
                  }));
                  showToast('Uygulama ve 81 il kataloğu varsayılan ayarlara döndürüldü.');
                }}
                onUpdateDayTitle={(dayId, title) =>
                  setState((prev) => ({
                    ...prev,
                    days: prev.days.map((d) => (d.id === dayId ? { ...d, title } : d)),
                  }))
                }
                onUpdateCustomTime={(dayId, placeIdx, timeVal) => {
                  let cleaned = timeVal.replace('.', ':').trim();
                  if (/^\d{4}$/.test(cleaned)) {
                    cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
                  }
                  setState((prev) => ({
                    ...prev,
                    days: prev.days.map((d) =>
                      d.id === dayId
                        ? {
                            ...d,
                            customTimes: { ...d.customTimes, [placeIdx]: cleaned },
                          }
                        : d
                    ),
                  }));
                }}
                onUpdatePlaceDuration={(dayId, placeIdx, duration) =>
                  setState((prev) => ({
                    ...prev,
                    days: prev.days.map((d) => {
                      if (d.id !== dayId) return d;
                      const nextPlaces = d.places.map((p, idx) =>
                        idx === placeIdx ? { ...p, duration } : p
                      );
                      return { ...d, places: nextPlaces };
                    }),
                  }))
                }
                onRemovePlaceFromDay={(dayId, placeIdx) =>
                  setState((prev) => ({
                    ...prev,
                    days: prev.days.map((d) => {
                      if (d.id !== dayId) return d;
                      const nextPlaces = d.places.filter((_, idx) => idx !== placeIdx);
                      const nextCustomTimes = { ...d.customTimes };
                      delete nextCustomTimes[placeIdx];
                      return {
                        ...d,
                        places: nextPlaces,
                        transits: recalculateAllDayTransits(nextPlaces),
                        customTimes: nextCustomTimes,
                      };
                    }),
                  }))
                }
                onMovePlaceInDay={handleMovePlaceInDay}
                onMovePlaceAcrossDays={handleMovePlaceAcrossDays}
                onDropCatalogPlaceOnDay={handleDropCatalogPlaceOnDay}
                onUpdateTransit={(dayId, idx, patch: Partial<TransitInfo>) =>
                  setState((prev) => ({
                    ...prev,
                    days: prev.days.map((d) => {
                      if (d.id !== dayId) return d;
                      const nextTransits = [...d.transits];
                      nextTransits[idx] = {
                        ...(nextTransits[idx] || {
                          km: 0,
                          min: 0,
                          walkMin: 0,
                          isWalkingOnly: false,
                        }),
                        ...patch,
                      };
                      return { ...d, transits: nextTransits };
                    }),
                  }))
                }
                onOpenAiGuide={(placeName, city) => setGuideTarget({ placeName, city })}
                onOpenAiWizard={() => setActiveView('ai-wizard')}
                onRunQuickPreset={handleRunQuickPreset}
                quickPresetLoadingId={quickPresetLoadingId}
                onExportJson={handleExportJson}
                onImportJson={handleImportJson}
                onMergeJson={handleMergeJson}
                onDownloadReport={handleDownloadReport}
                onApplyOptimizedDay={handleApplyOptimizedDay}
                onSave={handleManualSave}
                savedTemplates={state.savedTemplates}
                onSaveTemplate={handleSaveTemplate}
                onLoadTemplate={handleLoadTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onAddSuggestedStopToDay={handleAddSuggestedStopToDay}
                onNotify={showToast}
              />
            </div>
          </div>
        )}

        {activeView === 'ai-wizard' && (
          <FastAiWizardView
            catalogPlaces={catalogPlaces}
            currentDays={state.days}
            tourTitle={state.tourTitle}
            onApplyGeneratedTour={handleApplyGeneratedTour}
          />
        )}

        {activeView === 'turkey-atlas' && (
          <CatalogPanel
            fullPageMode
            catalogPlaces={catalogPlaces}
            cities={allCities}
            activeRegion={state.activeRegion}
            onChangeRegion={(r) => setState((prev) => ({ ...prev, activeRegion: r }))}
            activeCity={state.activeCity}
            onChangeCity={(c) => setState((prev) => ({ ...prev, activeCity: c }))}
            activeCategory={state.activeCategory}
            onChangeCategory={(cat) =>
              setState((prev) => ({ ...prev, activeCategory: cat }))
            }
            onAddPlaceToDay={handleAddPlaceToDay}
            onAddBatchToDay={handleAddBatchToDay}
            onOpenAiGuide={(placeName, city) => setGuideTarget({ placeName, city })}
            onMeasureDistance={handleMeasureDistance}
            measureFirstPlace={measureFirstPlace}
            onCancelMeasure={() => setMeasureFirstPlace(null)}
            onUpdateCatalogPlace={handleUpdateCatalogPlace}
            onDeleteCatalogPlace={handleDeleteCatalogPlace}
            onAddCity={(rawName) => {
              const clean = sanitizeCityName(rawName);
              setState((prev) => ({
                ...prev,
                customCities: prev.customCities.includes(clean)
                  ? prev.customCities
                  : [...prev.customCities, clean],
                activeCity: clean,
              }));
              showToast(`"${clean}" şehir listesine eklendi.`);
            }}
          />
        )}

        {activeView === 'report' && (
          <ReportPreviewView
            tourTitle={state.tourTitle}
            days={state.days}
            onDownloadHtmlReport={handleDownloadReport}
            onGoToPlanner={() => setActiveView('planner')}
          />
        )}
      </main>

      {/* AI Guide Notes Modal */}
      <AiGuideModal
        placeName={guideTarget?.placeName || null}
        city={guideTarget?.city || null}
        initialGuide={guidePlace?.guide ?? null}
        onSaveGuide={guidePlace ? handleSaveGuide : undefined}
        onClose={() => setGuideTarget(null)}
      />

      {/* Custom Place / Hotel Live Search Modal */}
      <CustomPlaceModal
        open={customModalOpen}
        cities={allCities}
        defaultCity={state.activeCity}
        onClose={() => setCustomModalOpen(false)}
        onSavePlace={(newPlace, alsoAddToActiveDay) => {
          setState((prev) => ({
            ...prev,
            customPlaces: [newPlace, ...prev.customPlaces],
            dirtyCities: Array.from(new Set([...prev.dirtyCities, newPlace.city])),
            customCities: allCities.includes(newPlace.city)
              ? prev.customCities
              : [...prev.customCities, newPlace.city],
          }));
          if (alsoAddToActiveDay) {
            handleAddPlaceToDay(newPlace);
          }
          showToast(`"${newPlace.name}" kataloğa kaydedildi.`);
        }}
      />

      {/* Gemini API Key Management Modal */}
      <ApiKeyModal
        open={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        onKeyChange={(hasKey: boolean) => {
          setHasCustomApiKey(hasKey);
          showToast(hasKey ? 'Gemini API anahtarı kaydedildi.' : 'Özel anahtar kaldırıldı.');
        }}
      />

      {/* Distance Measure Result Modal */}
      {distanceModalResult && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDistanceModalResult(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 shadow-xl text-center space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <Route className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                İki Durak Arası Mesafe
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                {distanceModalResult.from} → {distanceModalResult.to}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-200 border border-slate-200 rounded-lg bg-stone-50 p-3">
              <div>
                <div className="text-[11px] text-slate-500">Tahmini Yol</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {distanceModalResult.roadKm} km
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Tahmini Sürüş</div>
                <div className="text-base font-bold font-mono tabular-nums text-amber-800 mt-0.5">
                  {distanceModalResult.driveMins} dk
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDistanceModalResult(null)}
              className="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
