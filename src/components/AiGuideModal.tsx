import { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, RefreshCw, X, Edit3, Check, RotateCcw, MapPin, Navigation } from 'lucide-react';
import { AiGuideNote } from '../types';
import { getCategoryLabel } from '../data/categories';
import { getAiHeaders } from '../utils/aiApi';

interface AiGuideModalProps {
  placeName: string | null;
  city: string | null;
  district?: string | null;     // İlçe bilgisi
  neighborhood?: string | null; // Mahalle bilgisi
  address?: string | null;      // Açık adres
  lat?: number | null;
  lng?: number | null;
  initialGuide?: AiGuideNote | null;
  onSaveGuide?: (note: AiGuideNote) => void;
  onClose: () => void;
}

const GUIDE_CACHE_KEY = 'rota81_ai_guide_cache_v1';

function readGuideCache(): Record<string, AiGuideNote> {
  try {
    return JSON.parse(localStorage.getItem(GUIDE_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeGuideCache(key: string, val: AiGuideNote) {
  try {
    const existing = readGuideCache();
    existing[key] = val;
    localStorage.setItem(GUIDE_CACHE_KEY, JSON.stringify(existing));
  } catch {
    // ignore storage quota errors
  }
}

export function AiGuideModal({
  placeName,
  city,
  district,
  neighborhood,
  address,
  lat,
  lng,
  initialGuide,
  onSaveGuide,
  onClose,
}: AiGuideModalProps) {
  const [note, setNote] = useState<AiGuideNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const [originalNote, setOriginalNote] = useState<AiGuideNote | null>(null);

  const [editableHighlights, setEditableHighlights] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editableIntro, setEditableIntro] = useState('');
  const [editableStory, setEditableStory] = useState('');
  const [editableTip, setEditableTip] = useState('');
  const [editableFood, setEditableFood] = useState('');
  const [editableBestTime, setEditableBestTime] = useState('');
  const [editableDuration, setEditableDuration] = useState<number>(60);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cacheKey = `${placeName || ''}|${city || ''}`.toLocaleLowerCase('tr-TR');

  // Haritadan kaydedilen mahalle, ilçe, adres ve şehri şık bir şekilde birleştirir
  const displayLocation = (() => {
    const parts = [neighborhood, district, address].filter(Boolean);
    if (parts.length > 0) {
      return [...parts, city].filter(Boolean).join(' · ');
    }
    return city ? `${city}, Türkiye` : 'Konum bilgisi yok';
  })();

  function initEmptyGuide() {
    const emptyNote: AiGuideNote = {
      intro: `${placeName || 'Bu mekan'} hakkında henüz bir tanıtım girilmedi.`,
      story: 'Detaylı tarihçe veya açıklama eklemek için sağ üstteki "Bilgileri Düzenle" butonunu kullanabilirsiniz.',
      highlights: ['Özgün detay ekleyin'],
      local_tip: 'Rehber tüyosu ekleyin',
      must_eat_nearby: '',
      best_time: 'Gündüz saatleri',
      duration: 60,
      tag: '#tarih',
      mode: 'fast',
      modelUsed: 'Manuel / Boş Şablon',
    };
    setNote(emptyNote);
    setOriginalNote(emptyNote);
    initEditableFields(emptyNote);
  }

  async function loadGuide(bypassCache = false) {
    if (!placeName || !city) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const targetKey = cacheKey;

    if (!bypassCache) {
      if (initialGuide) {
        setNote(initialGuide);
        setOriginalNote(initialGuide);
        initEditableFields(initialGuide);
        setFromCache(true);
        setLoading(false);
        return;
      }
      const cached = readGuideCache()[targetKey];
      if (cached) {
        setNote(cached);
        setOriginalNote(cached);
        initEditableFields(cached);
        setFromCache(true);
        setError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/place-guide', {
        method: 'POST',
        headers: getAiHeaders(),
        body: JSON.stringify({ placeName, city, lat, lng, mode: 'fast' }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Rehber notu alınamadı.');
      }

      const result = data as AiGuideNote;
      writeGuideCache(targetKey, result);
      if (onSaveGuide) {
        onSaveGuide(result);
      }

      if (cacheKey === targetKey) {
        setNote(result);
        setOriginalNote(result);
        initEditableFields(result);
        setFromCache(false);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      if (cacheKey === targetKey) {
        setError((err as Error).message || 'Rehber bilgisi alınırken hata oluştu.');
      }
    } finally {
      if (cacheKey === targetKey) {
        setLoading(false);
      }
    }
  }

  function initEditableFields(guideData: AiGuideNote) {
    setEditableIntro(guideData.intro || '');
    setEditableStory(guideData.story || '');
    setEditableTip(guideData.local_tip || '');
    setEditableFood(guideData.must_eat_nearby || '');
    setEditableBestTime(guideData.best_time || '');
    setEditableDuration(guideData.duration || 60);
    setEditableHighlights(Array.isArray(guideData.highlights) ? [...guideData.highlights] : []);
  }

  function handleSaveEdit() {
    if (!note) return;
    const updatedNote: AiGuideNote = {
      ...note,
      intro: editableIntro,
      story: editableStory,
      local_tip: editableTip,
      must_eat_nearby: editableFood,
      best_time: editableBestTime,
      duration: editableDuration,
      highlights: editableHighlights,
    };
    setNote(updatedNote);
    writeGuideCache(cacheKey, updatedNote);
    if (onSaveGuide) {
      onSaveGuide(updatedNote);
    }
    setIsEditing(false);
  }

  // Kapatırken düzenleme açıksa, girilen bilgiler kaybolmasın diye önce kaydedilir
  function handleClose() {
    if (isEditing) {
      handleSaveEdit();
    }
    onClose();
  }

  useEffect(() => {
    setIsEditing(false);

    if (placeName && city) {
      if (initialGuide) {
        setNote(initialGuide);
        setOriginalNote(initialGuide);
        initEditableFields(initialGuide);
        setFromCache(true);
      } else {
        const cached = readGuideCache()[cacheKey];
        if (cached) {
          setNote(cached);
          setOriginalNote(cached);
          initEditableFields(cached);
          setFromCache(true);
        } else {
          initEmptyGuide();
        }
      }
      setLoading(false);
      setError(null);
    } else {
      setNote(null);
      setOriginalNote(null);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeName, city, initialGuide]);

  if (!placeName || !city) return null;

  return (
    // Arka plana tıklayınca KAPANMAZ; yalnızca X veya "Kapat" düğmesiyle kapanır.
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[88vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-amber-800 font-medium">
              {city} · Profesyonel Rehber Bilgi Kartı
            </div>
            <h3 className="font-display text-base font-bold text-slate-900 truncate">
              {placeName}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {originalNote && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Yaptığınız düzenlemeler silinecek ve önceki sürüme geri dönülecek. Emin misiniz?")) {
                    setNote(originalNote);
                    initEditableFields(originalNote);
                    writeGuideCache(cacheKey, originalNote);
                    if (onSaveGuide) {
                      onSaveGuide(originalNote);
                    }
                    setIsEditing(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
                title="Önceki sürüme geri dön"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Geri Al</span>
              </button>
            )}

            {note && !loading && (
              <button
                type="button"
                onClick={() => {
                  if (isEditing) {
                    handleSaveEdit();
                  } else {
                    setIsEditing(true);
                  }
                }}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  isEditing
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                }`}
              >
                {isEditing ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Kaydet
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5" /> Bilgileri Düzenle
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-lg transition-colors"
              title="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs leading-relaxed">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-amber-600 mx-auto" />
              <p className="font-medium text-slate-800">
                Yapay zekadan bilgiler getiriliyor (~1 saniye)...
              </p>
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-rose-700 font-medium">{error}</p>
              <button
                type="button"
                onClick={() => loadGuide(true)}
                className="px-3.5 py-1.5 bg-slate-900 text-white rounded-md font-semibold"
              >
                Tekrar Dene
              </button>
            </div>
          ) : note ? (
            <>
              {/* Key Metrics Strip */}
              <div className="grid grid-cols-3 divide-x divide-slate-200 border border-slate-200 rounded-lg bg-stone-50">
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">Önerilen Süre</div>
                  {isEditing ? (
                    <input
                      type="number"
                      value={editableDuration}
                      onChange={(e) => setEditableDuration(Number(e.target.value))}
                      className="w-full mt-0.5 p-1 border rounded text-xs font-mono"
                    />
                  ) : (
                    <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                      {note.duration || 60} dk
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">Kategori</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {getCategoryLabel(note.tag)}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] text-slate-500">En İyi Zaman</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editableBestTime}
                      onChange={(e) => setEditableBestTime(e.target.value)}
                      className="w-full mt-0.5 p-1 border rounded text-xs"
                    />
                  ) : (
                    <div className="font-semibold text-slate-900 mt-0.5 truncate" title={note.best_time}>
                      {note.best_time || 'Sabah saatleri'}
                    </div>
                  )}
                </div>
              </div>

              {/* Intro & Story */}
              <div className="space-y-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] font-bold text-amber-800 mb-1">Giriş Özeti Düzenle</label>
                      <textarea
                        value={editableIntro}
                        onChange={(e) => setEditableIntro(e.target.value)}
                        className="w-full p-2 border border-amber-300 rounded text-xs"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-800 mb-1">Detaylı Hikaye / Tarihçe Düzenle</label>
                      <textarea
                        value={editableStory}
                        onChange={(e) => setEditableStory(e.target.value)}
                        className="w-full p-2 border border-amber-300 rounded text-xs"
                        rows={4}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-slate-800 font-medium text-sm leading-relaxed">
                      {note.intro}
                    </p>
                    <p className="text-slate-600">{note.story}</p>
                  </>
                )}
              </div>

              {/* Highlights / Kaçırılmaması Gereken Detaylar */}
              <div className="pt-3 border-t border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2">
                  Kaçırılmaması Gereken Detaylar
                </h4>
                {isEditing ? (
                  <div className="space-y-2">
                    {editableHighlights.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={h}
                          onChange={(e) => {
                            const updated = [...editableHighlights];
                            updated[i] = e.target.value;
                            setEditableHighlights(updated);
                          }}
                          className="w-full p-1.5 border border-amber-300 rounded text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditableHighlights(editableHighlights.filter((_, idx) => idx !== i));
                          }}
                          className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded"
                        >
                          Sil
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditableHighlights([...editableHighlights, ''])}
                      className="mt-1 px-3 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded border border-amber-200"
                    >
                      + Yeni Detay Ekle
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-1.5 text-slate-700 list-disc pl-4">
                    {note.highlights?.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Practical Tip & Nearby Food */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                <div className="p-3 bg-stone-50 border border-slate-200 rounded-lg">
                  <div className="font-semibold text-slate-900 mb-1">Rehber Tüyosu</div>
                  {isEditing ? (
                    <textarea
                      value={editableTip}
                      onChange={(e) => setEditableTip(e.target.value)}
                      className="w-full p-1.5 border border-amber-300 rounded text-xs bg-white"
                      rows={2}
                    />
                  ) : (
                    <p className="text-slate-600">{note.local_tip}</p>
                  )}
                </div>
                {(note.must_eat_nearby || isEditing) && (
                  <div className="p-3 bg-stone-50 border border-slate-200 rounded-lg">
                    <div className="font-semibold text-slate-900 mb-1">
                      Yakında Ne Yenir?
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editableFood}
                        onChange={(e) => setEditableFood(e.target.value)}
                        className="w-full p-1.5 border border-amber-300 rounded text-xs bg-white"
                        rows={2}
                      />
                    ) : (
                      <p className="text-slate-600">{note.must_eat_nearby}</p>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer (Mahalle, İlçe ve Adres Alanı) */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3 font-mono tabular-nums flex-wrap min-w-0">
            <div className="flex items-center gap-1 shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {fromCache
                  ? 'Önbellekten açıldı'
                  : note?.elapsedMs
                  ? `${(note.elapsedMs / 1000).toFixed(2)} sn`
                  : 'Manuel / Hazır Şablon'}
              </span>
            </div>

            {/* Kaydedilen Mahalle / İlçe / Adres Bilgisi */}
            <div className="flex items-center gap-1 text-slate-600 font-sans border-l border-slate-200 pl-3 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate max-w-[280px]" title={displayLocation}>
                {displayLocation}
              </span>
            </div>

            {/* Koordinat Bilgisi */}
            {(lat !== undefined && lng !== undefined && lat !== null && lng !== null) && (
              <div className="flex items-center gap-1 text-slate-400 border-l border-slate-200 pl-3 hidden md:flex shrink-0">
                <Navigation className="w-3 h-3 text-slate-400 shrink-0" />
                <span>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                loadGuide(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors"
              title="Yapay zekadan güncel bilgileri getir"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin text-amber-600" /> : <RefreshCw className="w-3 h-3" />}
              <span>Yenile (AI Getir)</span>
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}