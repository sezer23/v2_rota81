import { useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LogIn } from 'lucide-react';
import { supabase } from '../utils/supabase';

export function CloudAccess() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMessage('Hesabınız oluşturuldu. E-postanıza gelen doğrulama bağlantısına tıklayıp bu sayfaya geri dönün.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Giriş yapılamadı. Bilgileri kontrol edip tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 flex items-center justify-center p-4 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold">Rota 81 bulut kaydı</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Rehber bilgilerinize ve planlarınıza her cihazdan ulaşmak için hesabınızla giriş yapın.
          İlk kullanımda hesap oluşturun.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            E-posta
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
          </label>
          <label className="block text-sm font-medium">
            Parola
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            />
            {mode === 'signup' && <span className="mt-1 block text-xs font-normal text-slate-500">En az 8 karakter</span>}
          </label>
          {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
          <button
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {busy ? 'İşleniyor…' : mode === 'login' ? 'Giriş yap' : 'Hesap oluştur'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}
          className="mt-4 w-full text-sm font-medium text-amber-800 hover:underline"
        >
          {mode === 'login' ? 'İlk kez mi kullanıyorsunuz? Hesap oluşturun' : 'Zaten hesabınız var mı? Giriş yapın'}
        </button>
      </section>
    </main>
  );
}
