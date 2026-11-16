import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { AiWizardResponse, Place, TourDay } from '../types';
import { CATEGORY_DEFINITIONS, getCategoryLabel } from '../data/categories';
import { PROVINCES_81, QUICK_AI_PRESETS } from '../data/turkeyCatalog';
import { getAiHeaders } from '../utils/aiApi';

interface FastAiWizardViewProps {
  catalogPlaces: Place[];
  currentDays: TourDay[];
  tourTitle: string;
  onApplyGeneratedTour: (result: AiWizardResponse, appendMode: boolean) => void;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function FastAiWizardView({
  catalogPlaces,
  currentDays,
  tourTitle,
  onApplyGeneratedTour,
}: FastAiWizardViewProps) {
  const [selectedCities, setSelectedCities] = useState<string[]>(['Gaziantep', 'Şanlıurfa']);
  const [cityQuery, setCityQuery] = useState('');
  const [dayCount, setDayCount] = useState<number>(3);
  const [tempo, setTempo] = useState<'rahat' | 'dengeli' | 'yogun'>('dengeli');
  const [selectedCats, setSelectedCats] = useState<string[]>([
    '#antik-kent',
    '#müze',
    '#tarih',
    '#restoran',
  ]);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedPreview, setGeneratedPreview] = useState<AiWizardResponse | null>(null);

  // Streaming Consultant state
  const [chatInput, setChatInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const filteredProvinces = useMemo(() => {
    const q = cityQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return PROVINCES_81;
    return PROVINCES_81.filter(
      (p) =>
        p.name.toLocaleLowerCase('tr-TR').includes(q) || p.plate.includes(q)
    );
  }, [cityQuery]);

  function toggleCity(name: string) {
    setSelectedCities((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function toggleCategory(tag: string) {
    setSelectedCats((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleGenerateRoute(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (selectedCities.length === 0 && !notes.trim()) {
      setErrorMsg('Lütfen en az bir il seçin veya özel rota isteğinizi yazın.');
      return;
    }

    setGenerating(true);
    setErrorMsg(null);

    try {
      const catalogSample = catalogPlaces
        .filter((p) => selectedCities.includes(p.city))
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
          cities: selectedCities,
          dayCount,
          tempo,
          categories: selectedCats,
          notes,
          catalogSample,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Rota oluşturulamadı.');
      }

      setGeneratedPreview(data as AiWizardResponse);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Beklenmeyen bir hata oluştu.');
    } finally {
      setGenerating(false);
    }
  }

  async function sendStreamingQuestion(promptText?: string) {
    const msg = (promptText ?? chatInput).trim();
    if (!msg || streaming) return;

    setChatInput('');
    setStreaming(true);
    setChatHistory((prev) => [
      ...prev,
      { role: 'user', content: msg },
      { role: 'assistant', content: '' },
    ]);

    const itineraryContext =
      currentDays.length === 0
        ? 'Kullanıcının henüz aktif gün listesi boş.'
        : `${tourTitle || 'İsimsiz Tur'} — ` +
          currentDays
            .map(
              (d, i) =>
                `${i + 1}. Gün (${d.title}): ${d.places.map((p) => p.name).join(', ') || 'Boş'}`
            )
            .join(' | ');

    try {
      const response = await fetch('/api/ai/assistant-stream', {
        method: 'POST',
        headers: getAiHeaders(),
        body: JSON.stringify({ message: msg, itineraryContext }),
      });

      if (!response.ok || !response.body) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Akış başlatılamadı.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payloadStr = line.slice(6).trim();
          if (!payloadStr) continue;
          const parsed = JSON.parse(payloadStr) as {
            text?: string;
            error?: string;
            done?: boolean;
          };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text) {
            setChatHistory((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = {
                  ...last,
                  content: last.content + parsed.text,
                };
              }
              return copy;
            });
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    } catch (err) {
      setChatHistory((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            content: `Hata: ${(err as Error).message}`,
          };
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  const quickQuestions = [
    'Mevcut rotamdaki günlerin temposunu ve eksik öğünleri değerlendir',
    'Yağmurlu hava durumunda mevcut şehirlerim için kapalı müze/han alternatifleri öner',
    'Çocuklu veya yaşlı misafirler için yürüyüşü az mola noktaları öner',
    'Güneydoğu Anadolu için 5 günlük ideal şehir ve konaklama dağılımı nasıl olmalı?',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 7 Cols: Instant Multi-Day Itinerary Builder */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="font-display text-xl font-bold text-slate-900">
            Hızlı AI Tur Sihirbazı
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Gemini Flash-Lite düşük gecikmeli motoru ile 81 ilden seçtiğiniz şehirler için saatli, koordinatlı ve yöresel restoranlı tam tur programını 1-2 saniye içinde üretir.
          </p>
        </div>

        {/* Ready Presets */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-700 block">
            Hazır Rota Şablonunu Doldur:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_AI_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedCities(p.cities);
                  setDayCount(p.dayCount);
                  setTempo(p.tempo);
                  setSelectedCats(p.categories);
                  setNotes(p.notes);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-amber-50 hover:text-amber-900 rounded-md transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleGenerateRoute} className="space-y-4">
          {/* Selected Cities */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800">
                1. Rotadaki İller ({selectedCities.length} seçili)
              </label>
              {selectedCities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCities([])}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Seçimi Temizle
                </button>
              )}
            </div>

            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {selectedCities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCity(c)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-700 rounded-md"
                  >
                    <span>{c}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg p-2.5 bg-stone-50/60 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="81 il içinde ara (örn: Mardin, 50, Kars, Muğla)..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-amber-600"
                />
              </div>
              <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-1">
                {filteredProvinces.map((prov) => {
                  const active = selectedCities.includes(prov.name);
                  return (
                    <button
                      key={prov.plate}
                      type="button"
                      onClick={() => toggleCity(prov.name)}
                      className={`px-2 py-1.5 text-xs rounded text-left truncate transition-colors ${
                        active
                          ? 'bg-amber-600 text-white font-semibold'
                          : 'bg-white hover:bg-stone-100 text-slate-700 border border-slate-200/70'
                      }`}
                    >
                      <span className="font-mono tabular-nums opacity-70 mr-1">
                        {prov.plate}
                      </span>
                      {prov.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Days & Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                2. Toplam Gün Sayısı
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDayCount(n)}
                    className={`w-9 h-9 text-xs font-bold font-mono tabular-nums rounded-md transition-colors ${
                      dayCount === n
                        ? 'bg-slate-900 text-white'
                        : 'bg-stone-100 text-slate-700 hover:bg-stone-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                3. Gezi Temposu
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-lg">
                {(
                  [
                    { id: 'rahat', label: 'Rahat (3-4)' },
                    { id: 'dengeli', label: 'Dengeli (4-5)' },
                    { id: 'yogun', label: 'Yoğun (6-7)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTempo(opt.id)}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      tempo === opt.id
                        ? 'bg-white text-slate-900 shadow-sm font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category Focus */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              4. Odak Kategoriler
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_DEFINITIONS.filter((c) => c.tag !== '#konaklama').map((cat) => {
                const active = selectedCats.includes(cat.tag);
                return (
                  <button
                    key={cat.tag}
                    type="button"
                    onClick={() => toggleCategory(cat.tag)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      active
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-100 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              5. Özel Not / Grup Özelliği (İsteğe Bağlı)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Akşamları meşhur kebapçılar olsun, yürüyüş mesafeleri kısa tutulsun..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
            />
          </div>

          {errorMsg && (
            <div className="p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={generating}
            className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Hızlı AI Rotayı Kuruyor...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Saniyeler İçinde Tur Programı Oluştur</span>
              </>
            )}
          </button>
        </form>

        {/* Generated Preview */}
        {generatedPreview && (
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] text-amber-800 font-mono tabular-nums">
                  Üretim süresi: {((generatedPreview.elapsedMs || 1200) / 1000).toFixed(2)} sn · {generatedPreview.days.length} Gün
                </div>
                <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                  {generatedPreview.tourTitle}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">{generatedPreview.summary}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onApplyGeneratedTour(generatedPreview, false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Programa Uygula</span>
                </button>
                {currentDays.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onApplyGeneratedTour(generatedPreview, true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Mevcut Günlere Ekle</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {generatedPreview.days.map((d, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-slate-900">
                    {idx + 1}. Gün — {d.title}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {d.stops.map((s, sIdx) => (
                      <div key={sIdx} className="py-1.5 flex items-start gap-2.5 text-xs">
                        <span className="font-mono tabular-nums text-amber-800 font-semibold shrink-0">
                          {s.startTime || '09:30'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-slate-900">{s.name}</span>
                          <span className="text-slate-500">
                            {' '}
                            · {s.city} · {getCategoryLabel(s.category)} · {s.duration} dk
                          </span>
                          {s.tip && <p className="text-[11px] text-slate-600">{s.tip}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Right 5 Cols: Live Streaming Tour Consultant */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-[680px]">
        <div className="border-b border-slate-200 pb-3 mb-3">
          <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-600" />
            <span>Anında Akışlı AI Tur Danışmanı</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mevcut rotanızı görür; beklemeden canlı akışla (streaming) alternatif durak, ulaşım ve lezzet tavsiyesi verir.
          </p>
        </div>

        {/* Quick Question Starters */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={streaming}
              onClick={() => sendStreamingQuestion(q)}
              className="text-left px-2.5 py-1.5 text-[11px] text-slate-700 bg-stone-100 hover:bg-amber-50 hover:text-amber-900 rounded-md transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Chat Stream Viewport */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 border-t border-slate-100 pt-3">
          {chatHistory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 text-xs text-slate-400">
              <Sparkles className="w-6 h-6 text-amber-500 mb-2" />
              <p>
                Yukarıdaki hazır sorulardan birine tıklayın veya Türkiye’deki herhangi bir şehir/rota hakkında sorunuzu aşağıya yazın.
              </p>
            </div>
          ) : (
            chatHistory.map((turn, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${
                  turn.role === 'user'
                    ? 'bg-slate-900 text-white ml-8'
                    : 'bg-stone-100 text-slate-800 mr-4'
                }`}
              >
                {turn.content || (streaming && i === chatHistory.length - 1 ? 'Yanıt yazılıyor...' : '')}
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendStreamingQuestion();
          }}
          className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Örn: Mardin'de akşam grup yemeği için 3 mekan öner..."
            className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            disabled={streaming || !chatInput.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shrink-0"
          >
            {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Sor</span>
          </button>
        </form>
      </section>
    </div>
  );
}
