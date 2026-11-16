
import { KeyRound, Plus } from 'lucide-react';
import { ActiveWorkspaceView } from '../types';

interface TopNavProps {
  activeView: ActiveWorkspaceView;
  onChangeView: (view: ActiveWorkspaceView) => void;
  onOpenCustomPlace: () => void;
  onOpenApiKeyModal: () => void;
  hasCustomApiKey: boolean;
}

export function TopNav({
  activeView,
  onChangeView,
  onOpenCustomPlace,
  onOpenApiKeyModal,
  hasCustomApiKey,
}: TopNavProps) {
  const navItems: Array<{ id: ActiveWorkspaceView; label: string }> = [
    { id: 'planner', label: 'Planlayıcı' },
    { id: 'turkey-atlas', label: '81 İl Kataloğu' },
    { id: 'report', label: 'Rapor & Çıktı' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 no-print">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Zone 1: Wordmark */}
        <button
          type="button"
          onClick={() => onChangeView('planner')}
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 rounded"
        >
          Rota81
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none ${
                  isActive
                    ? 'border-amber-600 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Actions (Gemini Key Button + Add Stop) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenApiKeyModal}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
              hasCustomApiKey
                ? 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100'
                : 'bg-stone-100 text-slate-700 border-slate-200 hover:bg-stone-200'
            }`}
            title="Gemini API anahtarını gir, değiştir veya test et"
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-700" />
            <span className="hidden sm:inline">Gemini Anahtarı</span>
            <span className="sm:hidden">API</span>
            {hasCustomApiKey ? (
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Özel anahtar tanımlı" />
            ) : (
              <span className="inline-block w-2 h-2 rounded-full bg-slate-300" title="Sunucu varsayılanı" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenCustomPlace}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Durak Ekle</span>
          </button>
        </div>
      </div>
    </header>
  );
}