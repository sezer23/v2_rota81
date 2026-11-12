import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search, Sparkles, X, AlertCircle } from 'lucide-react';
import { Place, FixedCategoryTag } from '../types';
import { CATEGORY_DEFINITIONS, normalizeTag } from '../data/categories';
import { PROVINCE_BY_NAME } from '../data/turkeyCatalog';
import { sanitizeCityName } from '../utils/geoAndTime';
import { getAiHeaders } from '../utils/aiApi';

interface CustomPlaceModalProps {
  open: boolean;
  cities: string[];
  defaultCity: string;
  onClose: () => void;
  onSavePlace: (newPlace: Place, alsoAddToActiveDay: boolean) => void;
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    province?: string;
    state?: string;
    city?: string;
    town?: string;
    county?: string;
    city_district?: string;
    suburb?: string;
    neighbourhood?: string;
    road?: string;
    house_number?: string;
  };
}

// Otel, restoran, kafe ve etkinlik kategorilerinde ek bilgi alanları açılır
const DETAIL_CATEGORY_RE = /konaklama|otel|restoran|kafe|cafe|etkinlik/i;
const HOTEL_CATEGORY_RE = /konaklama|otel/i;

function detectProvinceFromNominatim(item: NominatimItem): string {
  const a = item.address || {};
  let province = a.province || '';
  if (!province && a.state && !/bölge/i.test(a.state)) {
    province = a.state;
  }
  if (!province) {
    const parts = String(item.display_name || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cleanParts = parts.filter(
      (s) => !/^\d{4,5}$/.test(s) && !/bölge/i.test(s) && !/^türkiye$/i.test(s)
    );
    if (cleanParts.length > 0) province = cleanParts[cleanParts.length - 1];
    else province = a.city || a.town || '';
  }
  return sanitizeCityName(province || 'İstanbul');
}

export function CustomPlaceModal({
  open,
  cities,
  defaultCity,
  onClose,
  onSavePlace,
}: CustomPlaceModalProps) {
  const [mode, setMode] = useState<'durak' | 'otel'>('durak');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [name, setName] = useState('');
  const [city, setCity] = useState(defaultCity !== 'Tümü' ? defaultCity : 'İstanbul');
  const [duration, setDuration] = useState(60);
  const [category, setCategory] = useState<string>('#tarih');
  const [tip, setTip] = useState('');
  const [lat, setLat] = useState<string | number>(41.0082);
  const [lng, setLng] = useState<string | number>(28.9784);
  const [addDirectly, setAddDirectly] = useState(true);
  const [aiFilling, setAiFilling] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Ek bilgiler (otel / restoran / kafe / etkinlik)
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [source, setSource] = useState('');

  const debounceRef = useRef<number | null>(null);

  const showDetails = mode === 'otel' || DETAIL_CATEGORY_RE.test(category);
  const isHotelLike = mode === 'otel' || HOTEL_CATEGORY_RE.test(category);
  const priceUnit = isHotelLike ? 'gecelik' : 'kişi başı';

  useEffect(() => {
    if (open) {
      setMode('durak');
      setSearchQuery('');
      setSuggestions([]);
      setName('');
      const initialCity = defaultCity !== 'Tümü' ? defaultCity : 'İstanbul';
      setCity(initialCity);
      const prov = PROVINCE_BY_NAME[initialCity];
      if (prov) {
        setLat(prov.lat);
        setLng(prov.lng);
      }
      setDuration(60);
      setCategory('#tarih');
      setTip('');
      setDistrict('');
      setAddress('');
      setPhone('');
      setPriceMin('');
      setPriceMax('');
      setSource('');
      setFormError(null);
    }
  }, [open, defaultCity]);

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const trimmed = val.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            trimmed
          )}&countrycodes=tr&limit=8&addressdetails=1&accept-language=tr`
        );
        const data = (await res.json()) as NominatimItem[];
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 280);
  }

  function selectSuggestion(item: NominatimItem) {
    const shortName = item.display_name.split(',')[0].trim();
    const detectedCity = detectProvinceFromNominatim(item);
    const a = item.address || {};

    setName(shortName);
    setSearchQuery(shortName);
    setCity(detectedCity);
    setLat(parseFloat(item.lat) || 39.0);
    setLng(parseFloat(item.lon) || 35.0);

    // İlçe ve adresi haritadan ön doldur (istenirse elle değiştirilebilir)
    const districtGuess = a.county || a.town || a.city_district || a.suburb || '';
    setDistrict(districtGuess && districtGuess !== detectedCity ? districtGuess : '');
    const road = [a.neighbourhood || a.suburb, a.road, a.house_number].filter(Boolean).join(' ');
    setAddress(road || item.display_name);

    setSuggestions([]);
    setFormError(null);
  }

  async function handleAiAutoFill() {
    if (!name.trim()) return;
    setAiFilling(true);
    try {
      const res = await fetch('/api/ai/place-guide', {
        method: 'POST',
        headers: getAiHeaders(),
        body: JSON.stringify({ placeName: name.trim(), city, mode: 'fast' }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.duration) setDuration(Number(data.duration) || 60);
        if (data.tag && mode === 'durak') setCategory(normalizeTag(data.tag) || '#tarih');
        if (data.local_tip || data.intro) {
          setTip(data.local_tip || data.intro);
        }
      }
    } catch {
      // ignore
    } finally {
      setAiFilling(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Lütfen mekan veya konaklama tesisinin adını girin.');
      return;
    }

    const parsedLat = typeof lat === 'string' ? parseFloat(lat.replace(',', '.')) : lat;
    const parsedLng = typeof lng === 'string' ? parseFloat(lng.replace(',', '.')) : lng;

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setFormError('Geçersiz koordinat! Lütfen geçerli bir enlem ve boylam girin.');
      return;
    }

    // Ek bilgiler (yalnızca otel / restoran / kafe / etkinlik)
    const extra: Partial<Place> = {};
    if (showDetails) {
      if (district.trim()) extra.district = district.trim();
      if (address.trim()) extra.address = address.trim();
      if (phone.trim()) extra.phone = phone.trim();
      if (source.trim()) extra.source = source.trim();

      const min = parseFloat(priceMin.replace(',', '.'));
      const max = parseFloat(priceMax.replace(',', '.'));
      const hasMin = !isNaN(min) && min >= 0;
      const hasMax = !isNaN(max) && max >= 0;

      if (hasMin && hasMax && min > max) {
        setFormError('Fiyat aralığında en düşük değer, en yüksek değerden büyük olamaz.');
        return;
      }
      if (hasMin) extra.priceMinUsd = min;
      if (hasMax) extra.priceMaxUsd = max;
      if (hasMin || hasMax) {
        extra.priceUnit = priceUnit;
        extra.priceUpdatedAt = new Date().toISOString();
      }
    }

    const cleanCity = sanitizeCityName(city);

    // Kesin Atama: Mod 'otel' ise kategori kesinlikle '#konaklama' olarak atanır.
    const finalCategory: FixedCategoryTag = mode === 'otel' ? '#konaklama' : (normalizeTag(category) as FixedCategoryTag) || '#tarih';

    const newPlace: Place = {
      id: `${mode === 'otel' ? 'hotel' : 'custom'}-${Date.now()}`,
      city: cleanCity,
      region: PROVINCE_BY_NAME[cleanCity]?.region,
      category: finalCategory,
      name: name.trim(),
      duration: mode === 'otel' ? 0 : Math.max(5, Number(duration) || 60),
      tip: tip.trim() || (mode === 'otel' ? 'Konaklama tesisi' : ''),
      lat: parsedLat,
      lng: parsedLng,
      isCustom: true,
      ...extra,
    };

    onSavePlace(newPlace, addDirectly);
    onClose();
  }

  if (!open) return null;

  return (
    // Arka plana tıklayınca KAPANMAZ; yalnızca X veya "İptal" ile kapanır (yazılanlar kaybolmasın).
    <div className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 shadow-xl space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
          <h3 className="font-display text-base font-bold text-slate-900">
            Haritadan Durak veya Konaklama Ekle
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-800 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {/* Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-stone-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('durak');
                if (category === '#konaklama') setCategory('#tarih');
              }}
              className={`py-1.5 font-semibold rounded-md transition-colors ${
                mode === 'durak'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gezi Durağı / Restoran
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('otel');
                setCategory('#konaklama');
              }}
              className={`py-1.5 font-semibold rounded-md transition-colors ${
                mode === 'otel'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Konaklama (Otel)
            </button>
          </div>

          {/* Live Nominatim Search */}
          <div className="relative space-y-1.5">
            <label className="block font-semibold text-slate-700">
              Canlı Türkiye Harita Araması (Otomatik Koordinat & İl)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={
                  mode === 'otel'
                    ? 'Örn: Museum Hotel Ürgüp, Mardius Tarihi Konak...'
                    : 'Örn: İmam Çağdaş, Mor Gabriel, Pokut Yaylası...'
                }
                className="w-full pl-8 pr-8 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-600"
              />
              {searching && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 absolute right-3 top-2.5" />
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-40 max-h-48 overflow-y-auto divide-y divide-slate-100">
                {suggestions.map((item, idx) => {
                  const shortTitle = item.display_name.split(',')[0];
                  const prov = detectProvinceFromNominatim(item);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => selectSuggestion(item)}
                      className="w-full px-3 py-2 text-left hover:bg-amber-50 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>{shortTitle}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {item.display_name}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-amber-800 shrink-0">
                        {prov}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Latitude & Longitude Inputs */}
          <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-2 rounded-lg border border-amber-200/60">
            <div>
              <label className="block font-medium text-slate-700 mb-0.5 text-[11px] flex items-center justify-between">
                <span>Enlem (Lat)</span>
                <span className="text-[10px] text-amber-800">*Zorunlu</span>
              </label>
              <input
                type="text"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value);
                  setFormError(null);
                }}
                placeholder="Örn: 39.9334"
                className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono text-xs focus:outline-none focus:border-amber-600"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-0.5 text-[11px] flex items-center justify-between">
                <span>Boylam (Lng)</span>
                <span className="text-[10px] text-amber-800">*Zorunlu</span>
              </label>
              <input
                type="text"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value);
                  setFormError(null);
                }}
                placeholder="Örn: 32.8597"
                className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono text-xs focus:outline-none focus:border-amber-600"
              />
            </div>
          </div>

          {/* Name + AI Autofill */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Mekan / Tesis Adı</label>
              {mode === 'durak' && name.trim().length > 2 && (
                <button
                  type="button"
                  disabled={aiFilling}
                  onClick={handleAiAutoFill}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950"
                >
                  {aiFilling ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>AI ile Süre & Not Doldur</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
              placeholder={mode === 'otel' ? 'Otel adını yazın...' : 'Mekan adını yazın...'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium focus:outline-none focus:border-amber-600"
            />
          </div>

          {/* City & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">İl (Manuel Düzenlenebilir)</label>
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setFormError(null);
                }}
                placeholder="Örn: Ankara"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:border-amber-600"
              />
            </div>

            {mode === 'durak' && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ziyaret Süresi (dk)
                </label>
                <input
                  type="number"
                  min={10}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value, 10) || 60)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-none focus:border-amber-600"
                />
              </div>
            )}
          </div>

          {/* Category */}
          {mode === 'durak' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-600 bg-white"
              >
                {CATEGORY_DEFINITIONS.filter((c) => c.tag !== '#konaklama').map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.label} ({c.tag})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Ek Bilgiler: Otel / Restoran / Kafe / Etkinlik */}
          {showDetails && (
            <div className="space-y-2.5 p-3 bg-stone-50 border border-slate-200 rounded-lg">
              <div className="font-semibold text-slate-800">
                {isHotelLike ? 'Konaklama Bilgileri' : 'İşletme / Etkinlik Bilgileri'}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">İlçe</label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="Örn: Artuklu"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-amber-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Örn: +90 482 000 00 00"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-amber-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Adres</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Mahalle, cadde, no..."
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Tahmini Fiyat Aralığı (USD, {priceUnit})
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-slate-400">$</span>
                    <input
                      type="number"
                      min={0}
                      value={priceMin}
                      onChange={(e) => {
                        setPriceMin(e.target.value);
                        setFormError(null);
                      }}
                      placeholder="En düşük"
                      className="w-full pl-6 pr-2 py-1.5 border border-slate-300 rounded-md bg-white font-mono tabular-nums focus:outline-none focus:border-amber-600"
                    />
                  </div>
                  <span className="text-slate-400">–</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-slate-400">$</span>
                    <input
                      type="number"
                      min={0}
                      value={priceMax}
                      onChange={(e) => {
                        setPriceMax(e.target.value);
                        setFormError(null);
                      }}
                      placeholder="En yüksek"
                      className="w-full pl-6 pr-2 py-1.5 border border-slate-300 rounded-md bg-white font-mono tabular-nums focus:outline-none focus:border-amber-600"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Fiyatlar sürekli değişir; buradaki değer tahmindir. Girildiği tarih kayda eklenir.
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Kaynak</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Örn: resmi site, Booking.com, telefonla görüşme, yerinde"
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:border-amber-600"
                />
              </div>
            </div>
          )}

          {/* Tip */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rehber Notu / Püf Noktası
            </label>
            <textarea
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              rows={2}
              placeholder={mode === 'otel' ? 'Giriş-çıkış saatleri, oda özellikleri...' : 'Ziyaret saati, giriş veya lezzet tavsiyesi...'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>

          {/* Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={addDirectly}
              onChange={(e) => setAddDirectly(e.target.checked)}
              className="rounded border-slate-300 text-amber-600 focus:ring-amber-600"
            />
            <span className="text-slate-700 font-medium">
              Kataloğa kaydet ve aynı zamanda aktif güne ekle
            </span>
          </label>

          {formError && (
            <div className="flex items-center gap-1.5 text-rose-600 font-medium bg-rose-50 p-2 rounded-lg border border-rose-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
            >
              Kaydet
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}