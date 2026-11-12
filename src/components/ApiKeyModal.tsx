import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  getStoredApiKey,
  maskApiKey,
  removeStoredApiKey,
  setStoredApiKey,
  testGeminiApiKey,
} from '../utils/aiApi';

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
  onKeyChange: (hasKey: boolean) => void;
}

export function ApiKeyModal({ open, onClose, onKeyChange }: ApiKeyModalProps) {
  const currentSavedKey = getStoredApiKey();
  const [apiKeyInput, setApiKeyInput] = useState(currentSavedKey);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  if (!open) return null;

  async function handleTestAndSave() {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setTestResult({
        ok: false,
        message: 'Lütfen bir Gemini API anahtarı girin veya mevcut anahtarı temizleyin.',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await testGeminiApiKey(trimmed);
      setStoredApiKey(trimmed);
      onKeyChange(true);
      setTestResult({
        ok: true,
        message: res.message || 'API anahtarı başarıyla doğrulandı ve kaydedildi!',
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: (err as Error).message || 'API anahtarı doğrulanırken bir hata oluştu.',
      });
    } finally {
      setTesting(false);
    }
  }

  function handleRemoveKey() {
    removeStoredApiKey();
    setApiKeyInput('');
    setTestResult({
      ok: true,
      message: 'Özel anahtar silindi. Sistem artık varsayılan sunucu anahtarını kullanacak.',
    });
    onKeyChange(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 no-print"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Gemini API Anahtarı Ayarları
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kendi ücretsiz Google Gemini API anahtarınızı tanımlayın
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info & Link */}
        <div className="p-3.5 bg-stone-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
          <div className="flex items-center justify-between font-semibold text-slate-900">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Güvenli Yerel Depolama</span>
            </span>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-800 hover:underline font-semibold"
            >
              <span>Ücretsiz Anahtar Al</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <p className="leading-relaxed">
            Girdiğiniz anahtar yalnızca bu tarayıcının yerel belleğinde (<code>localStorage</code>) saklanır.
            Tur sihirbazı, akışlı danışman ve rehber notu üretimleri doğrudan bu anahtar üzerinden çalışır.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-1.5">
          <label htmlFor="gemini-key-input" className="block text-xs font-semibold text-slate-800">
            API Anahtarı (AIzaSy...)
          </label>
          <div className="relative">
            <input
              id="gemini-key-input"
              type={showPassword ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => {
                setApiKeyInput(e.target.value);
                setTestResult(null);
              }}
              placeholder="AIzaSy..."
              className="w-full pl-3 pr-20 py-2.5 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-amber-600"
            />
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
                title={showPassword ? 'Gizle' : 'Göster'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {currentSavedKey && (
            <div className="text-[11px] text-slate-500 font-mono">
              Kayıtlı: <span className="font-semibold text-slate-700">{maskApiKey(currentSavedKey)}</span>
            </div>
          )}
        </div>

        {/* Status / Feedback banner */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              testResult.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed">{testResult.message}</div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <div>
            {currentSavedKey && (
              <button
                type="button"
                onClick={handleRemoveKey}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                title="Tarayıcıda kayıtlı anahtarı sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Anahtarı Kaldır</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg"
            >
              Kapat
            </button>
            <button
              type="button"
              disabled={testing || !apiKeyInput.trim()}
              onClick={handleTestAndSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Test Ediliyor...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Test Et & Kaydet</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

