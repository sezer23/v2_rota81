import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FolderPlus,
  Layers,
  List,
  Plus,
  Ruler,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Place, RegionName } from '../types';
import {
  CATEGORY_DEFINITIONS,
  getCategoryFullLabel,
  getCategoryLabel,
  isAccommodationPlace,
  normalizeTag,
  REGIONS_LIST,
} from '../data/categories';
import { PROVINCE_BY_NAME, PROVINCES_81 } from '../data/turkeyCatalog';

interface CatalogPanelProps {
  catalogPlaces: Place[];
  cities: string[];
  activeRegion: RegionName | 'Tümü';
  onChangeRegion: (r: RegionName | 'Tümü') => void;
  activeCity: string;
  onChangeCity: (city: string) => void;
  activeCategory: string;
  onChangeCategory: (cat: string) => void;
  onAddPlaceToDay: (place: Place) => void;
  onAddBatchToDay: (places: Place[], groupTitle?: string) => void;
  onOpenAiGuide: (placeName: string, city: string) => void;
  onMeasureDistance: (place: Place) => void;
  measureFirstPlace: Place | null;
  onCancelMeasure: () => void;
  onUpdateCatalogPlace: (updated: Place) => void;
  onDeleteCatalogPlace: (placeId: string) => void;
  onAddCity: (cityName: string) => void;
  fullPageMode?: boolean;
}

export function CatalogPanel({
  catalogPlaces,
  cities,
  activeRegion,
  onChangeRegion,
  activeCity,
  onChangeCity,
  activeCategory,
  onChangeCategory,
  onAddPlaceToDay,
  onAddBatchToDay,
  onOpenAiGuide,
  onMeasureDistance,
  measureFirstPlace,
  onCancelMeasure,
  onUpdateCatalogPlace,
  onDeleteCatalogPlace,
  onAddCity,
  fullPageMode = false,
}: CatalogPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Place | null>(null);
  const [addingCityMode, setAddingCityMode] = useState(false);
  const [newCityName, setNewCityName] = useState('');

  // Count places per city
  const cityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of catalogPlaces) {
      counts[p.city] = (counts[p.city] || 0) + 1;
    }
    return counts;
  }, [catalogPlaces]);

  // Provinces filtered by region + citySearch
  const visibleProvinces = useMemo(() => {
    const q = citySearch.trim().toLocaleLowerCase('tr-TR');
    const knownNames = new Set(PROVINCES_81.map((p) => p.name));
    const customCities = cities
      .filter((c) => !knownNames.has(c))
      .map((c) => ({
        plate: '--',
        name: c,
        region: 'Marmara' as RegionName,
        lat: 39.0,
        lng: 35.0,
        summary: 'Özel eklenen şehir',
      }));

    const combined = [...PROVINCES_81, ...customCities];
    return combined.filter((prov) => {
      const regionMatch =
        activeRegion === 'Tümü' ||
        prov.plate === '--' ||
        prov.region === activeRegion;
      if (!regionMatch) return false;
      if (!q) return true;
      return (
        prov.name.toLocaleLowerCase('tr-TR').includes(q) ||
        prov.plate.includes(q)
      );
    });
  }, [activeRegion, cities, citySearch]);

  // Filtered catalog places
  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return catalogPlaces.filter((item) => {
      const itemRegion = item.region || PROVINCE_BY_NAME[item.city]?.region;
      const matchRegion =
        activeRegion === 'Tümü' || !itemRegion || itemRegion === activeRegion;
      const matchCity = activeCity === 'Tümü' || item.city === activeCity;
      const normCat = normalizeTag(item.category);
      const matchCat =
        activeCategory === 'Tümü' || normCat === activeCategory;
      const matchSearch =
        !q ||
        item.name.toLocaleLowerCase('tr-TR').includes(q) ||
        item.city.toLocaleLowerCase('tr-TR').includes(q) ||
        (item.tip && item.tip.toLocaleLowerCase('tr-TR').includes(q)) ||
        normCat.toLocaleLowerCase('tr-TR').includes(q);

      return matchRegion && matchCity && matchCat && matchSearch;
    });
  }, [catalogPlaces, activeRegion, activeCity, activeCategory, searchQuery]);

  // Category counts for current city/region filter
  const categoryCountsInScope = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const map: Record<string, number> = {};
    for (const item of catalogPlaces) {
      const itemRegion = item.region || PROVINCE_BY_NAME[item.city]?.region;
      const matchRegion =
        activeRegion === 'Tümü' || !itemRegion || itemRegion === activeRegion;
      const matchCity = activeCity === 'Tümü' || item.city === activeCity;
      const matchSearch =
        !q ||
        item.name.toLocaleLowerCase('tr-TR').includes(q) ||
        item.city.toLocaleLowerCase('tr-TR').includes(q) ||
        (item.tip && item.tip.toLocaleLowerCase('tr-TR').includes(q));
      if (matchRegion && matchCity && matchSearch) {
        const norm = normalizeTag(item.category) || '#tarih';
        map[norm] = (map[norm] || 0) + 1;
      }
    }
    return map;
  }, [catalogPlaces, activeRegion, activeCity, searchQuery]);

  // Grouped by category
  const groupedPlaces = useMemo(() => {
    const groups: Array<{ tag: string; title: string; items: Place[] }> = [];
    const byTag: Record<string, Place[]> = {};

    for (const p of filteredPlaces) {
      const t = normalizeTag(p.category) || '#tarih';
      if (!byTag[t]) byTag[t] = [];
      byTag[t].push(p);
    }

    for (const def of CATEGORY_DEFINITIONS) {
      if (byTag[def.tag]?.length) {
        groups.push({
          tag: def.tag,
          title: def.label,
          items: byTag[def.tag],
        });
        delete byTag[def.tag];
      }
    }
    for (const [tag, items] of Object.entries(byTag)) {
      groups.push({
        tag,
        title: getCategoryFullLabel(tag),
        items,
      });
    }
    return groups;
  }, [filteredPlaces]);

  const activeProvinceMeta = activeCity !== 'Tümü' ? PROVINCE_BY_NAME[activeCity] : undefined;

  function toggleCategoryCollapse(tag: string) {
    setCollapsedCategories((prev) => ({ ...prev, [tag]: !prev[tag] }));
  }

  function startEdit(place: Place) {
    setEditingId(place.id);
    setEditDraft({ ...place });
  }

  function saveEdit() {
    if (editDraft && editDraft.name.trim()) {
      onUpdateCatalogPlace({
        ...editDraft,
        name: editDraft.name.trim(),
        category: normalizeTag(editDraft.category),
      });
    }
    setEditingId(null);
    setEditDraft(null);
  }

  function handleCreateCity(e: React.FormEvent) {
    e.preventDefault();
    if (!newCityName.trim()) return;
    onAddCity(newCityName.trim());
    setNewCityName('');
    setAddingCityMode(false);
  }

  function renderPlaceRow(place: Place) {
    const isMeasured = measureFirstPlace?.id === place.id;
    const isHotel = isAccommodationPlace(place.category, place.name);
    const catLabel = getCategoryLabel(place.category);

    if (editingId === place.id && editDraft) {
      return (
        <div key={place.id} className="p-3 bg-stone-50 border-b border-slate-200 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={editDraft.name}
              onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
              className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md focus:outline-none focus:border-amber-600"
              placeholder="Mekan adı"
            />
            <div className="flex gap-2">
              <select
                value={normalizeTag(editDraft.category)}
                onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-amber-600"
              >
                {CATEGORY_DEFINITIONS.map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.shortLabel} ({c.tag})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={5}
                value={editDraft.duration}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, duration: parseInt(e.target.value, 10) || 0 })
                }
                className="w-20 px-2 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-amber-600"
                title="Ziyaret süresi (dk)"
              />
            </div>
          </div>
          <input
            type="text"
            value={editDraft.tip}
            onChange={(e) => setEditDraft({ ...editDraft, tip: e.target.value })}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-amber-600"
            placeholder="Rehber notu / ipucu..."
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEditDraft(null);
              }}
              className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Kaydet</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={place.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-rota81-catalog-id', place.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onDoubleClick={() => startEdit(place)}
        className={`group px-3.5 py-3 transition-colors cursor-grab active:cursor-grabbing ${
          isMeasured
            ? 'bg-amber-100/90 border-l-4 border-amber-600'
            : 'hover:bg-stone-50/90'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
              <span className="font-semibold text-amber-800">{place.city}</span>
              <span aria-hidden="true">·</span>
              <span>{catLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {isHotel ? 'Konaklama' : `${place.duration} dk`}
              </span>
            </div>

            <h4 className="text-sm font-semibold text-slate-900 mt-0.5 leading-snug">
              {place.name}
            </h4>

            {place.tip && (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed line-clamp-2">
                {place.tip}
              </p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            {!isHotel && (
              <button
                type="button"
                onClick={() => onOpenAiGuide(place.name, place.city)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                title="Hızlı AI Rehber Notu (~1 sn)"
              >
                <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Rehber</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isMeasured) {
                  onCancelMeasure();
                } else {
                  onMeasureDistance(place);
                }
              }}
              className={`p-1.5 rounded-md transition-colors ${
                isMeasured
                  ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
              title={isMeasured ? 'Ölçüm modunu kapat / İptal et' : 'Mesafe ölçümü için seç / Sabitle'}
            >
              <Ruler className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => startEdit(place)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Düzenle"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>

            {place.isCustom && (
              <button
                type="button"
                onClick={() => onDeleteCatalogPlace(place.id)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                title="Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onAddPlaceToDay(place)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors whitespace-nowrap shrink-0"
              title="Aktif güne ekle"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ekle</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`bg-white border border-slate-200 rounded-xl flex flex-col ${
        fullPageMode ? 'min-h-[calc(100vh-120px)]' : 'h-[calc(100vh-108px)] lg:sticky lg:top-20'
      }`}
    >
      {/* Top Header & Region Bar */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              81 İl Türkiye Gezi Kataloğu
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {PROVINCES_81.length} il · {filteredPlaces.length} listelenen durak (toplam {catalogPlaces.length})
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setGroupByCategory((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              title={groupByCategory ? 'Düz listeye geç' : 'Kategori başlıklarıyla grupla'}
            >
              {groupByCategory ? <Layers className="w-3.5 h-3.5 text-amber-700" /> : <List className="w-3.5 h-3.5" />}
              <span>{groupByCategory ? 'Kategorili' : 'Düz Liste'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAddingCityMode((v) => !v)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-stone-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              title="Özel şehir/bölge ekle"
            >
              + Şehir
            </button>
          </div>
        </div>

        {addingCityMode && (
          <form onSubmit={handleCreateCity} className="flex items-center gap-2">
            <input
              type="text"
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              placeholder="Yeni bölge / ilçe adı (örn: Kapadokya, Kaş)..."
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-amber-600"
              autoFocus
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              Ekle
            </button>
          </form>
        )}

        {/* Region Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => onChangeRegion('Tümü')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeRegion === 'Tümü'
                ? 'bg-slate-900 text-white'
                : 'bg-stone-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Tüm Bölgeler
          </button>
          {REGIONS_LIST.map((reg) => (
            <button
              key={reg}
              type="button"
              onClick={() => {
                onChangeRegion(reg);
                if (
                  activeCity !== 'Tümü' &&
                  PROVINCE_BY_NAME[activeCity] &&
                  PROVINCE_BY_NAME[activeCity].region !== reg
                ) {
                  onChangeCity('Tümü');
                }
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeRegion === reg
                  ? 'bg-slate-900 text-white'
                  : 'bg-stone-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>

        {/* Searchable Province Selector + Search Input */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setCityPickerOpen((o) => !o)}
              className="w-full px-3 py-2 text-xs font-medium bg-stone-50 hover:bg-stone-100 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-left transition-colors"
            >
              <span className="truncate">
                İl:{' '}
                <strong className="text-slate-900 font-semibold">
                  {activeCity === 'Tümü'
                    ? 'Tüm İller (81 İl)'
                    : `${PROVINCE_BY_NAME[activeCity]?.plate ? `${PROVINCE_BY_NAME[activeCity].plate} · ` : ''}${activeCity}`}
                </strong>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </button>

            {cityPickerOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-2 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder="Plaka kodu (01-81) veya il adı yazın..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-amber-600"
                    autoFocus
                  />
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeCity('Tümü');
                      setCityPickerOpen(false);
                      setCitySearch('');
                    }}
                    className={`w-full px-2.5 py-2 text-xs flex items-center justify-between rounded-md ${
                      activeCity === 'Tümü'
                        ? 'bg-amber-50 text-amber-900 font-semibold'
                        : 'text-slate-700 hover:bg-stone-50'
                    }`}
                  >
                    <span>Tüm İller</span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {catalogPlaces.length} yer
                    </span>
                  </button>
                  {visibleProvinces.map((prov) => {
                    const selected = activeCity === prov.name;
                    const cnt = cityCounts[prov.name] || 0;
                    return (
                      <button
                        key={`${prov.plate}-${prov.name}`}
                        type="button"
                        onClick={() => {
                          onChangeCity(prov.name);
                          setCityPickerOpen(false);
                          setCitySearch('');
                        }}
                        className={`w-full px-2.5 py-1.5 text-xs flex items-center justify-between rounded-md ${
                          selected
                            ? 'bg-amber-50 text-amber-900 font-semibold'
                            : 'text-slate-700 hover:bg-stone-50'
                        }`}
                      >
                        <span className="truncate">
                          <span className="font-mono tabular-nums text-slate-400 mr-1.5">
                            {prov.plate}
                          </span>
                          {prov.name}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0 ml-2">
                          {cnt} yer
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Mekan, ören yeri veya yemek ara..."
              className="w-full pl-8 pr-7 py-2 text-xs bg-stone-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-amber-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            type="button"
            onClick={() => onChangeCategory('Tümü')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'Tümü'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            Tüm Kategoriler
          </button>
          {CATEGORY_DEFINITIONS.map((cat) => {
            const count = categoryCountsInScope[cat.tag] || 0;
            if (count === 0 && activeCategory !== cat.tag) return null;
            const isSelected = activeCategory === cat.tag;
            return (
              <button
                key={cat.tag}
                type="button"
                onClick={() => onChangeCategory(isSelected ? 'Tümü' : cat.tag)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  isSelected
                    ? 'bg-amber-600 text-white'
                    : 'bg-stone-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.shortLabel} ({count})
              </button>
            );
          })}
        </div>

        {/* Selected Province Brief & Quick Batch Add */}
        {activeProvinceMeta && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600 flex-1 min-w-[200px]">
              <span className="font-semibold text-slate-900">
                {activeProvinceMeta.plate} {activeProvinceMeta.name} ({activeProvinceMeta.region}):
              </span>{' '}
              {activeProvinceMeta.summary}
            </p>
            {filteredPlaces.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onAddBatchToDay(
                    filteredPlaces.slice(0, 6),
                    `${activeProvinceMeta.name} Gezisi`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>İlk {Math.min(6, filteredPlaces.length)} Durağı Yeni Güne Aktar</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Places Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-200/80">
        {filteredPlaces.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Seçili filtreye uygun durak bulunamadı.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Arama metnini veya kategori/şehir filtresini sıfırlayarak tüm 81 il kataloğunu görebilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => {
                onChangeRegion('Tümü');
                onChangeCity('Tümü');
                onChangeCategory('Tümü');
                setSearchQuery('');
              }}
              className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : groupByCategory ? (
          groupedPlaces.map((group) => {
            const isCollapsed = Boolean(collapsedCategories[group.tag]);
            return (
              <div key={group.tag} className="bg-white">
                <div className="sticky top-0 z-10 bg-stone-100/95 backdrop-blur px-3.5 py-2 flex items-center justify-between gap-2 border-b border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => toggleCategoryCollapse(group.tag)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-slate-950 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{group.title}</span>
                    <span className="text-slate-500 font-normal font-mono tabular-nums">
                      · {group.items.length}
                    </span>
                  </button>

                  {activeCity !== 'Tümü' && group.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onAddBatchToDay(
                          group.items,
                          `${activeCity} — ${getCategoryLabel(group.tag)}`
                        )
                      }
                      className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 whitespace-nowrap shrink-0"
                    >
                      + Kategoriyi Ekle
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div
                    className={
                      fullPageMode
                        ? 'grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:gap-px bg-slate-200/60'
                        : 'divide-y divide-slate-100'
                    }
                  >
                    {group.items.map((place) => (
                      <div key={place.id} className="bg-white">
                        {renderPlaceRow(place)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div
            className={
              fullPageMode
                ? 'grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-200/60'
                : 'divide-y divide-slate-100'
            }
          >
            {filteredPlaces.map((place) => (
              <div key={place.id} className="bg-white">
                {renderPlaceRow(place)}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}