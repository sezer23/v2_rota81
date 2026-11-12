export const GEMINI_API_KEY_STORAGE = 'rota81_gemini_api_key';

export function getStoredApiKey(): string {
  try {
    return (localStorage.getItem(GEMINI_API_KEY_STORAGE) || '').trim();
  } catch {
    return '';
  }
}

export function setStoredApiKey(key: string): void {
  const clean = key.trim();
  if (clean) {
    localStorage.setItem(GEMINI_API_KEY_STORAGE, clean);
  } else {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
  }
}

export function removeStoredApiKey(): void {
  try {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  const clean = key.trim();
  if (clean.length <= 10) return '••••••••';
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

export function getAiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
  const key = getStoredApiKey();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}

export async function testGeminiApiKey(candidateKey?: string): Promise<{
  ok: boolean;
  message: string;
  modelUsed?: string;
  source?: 'custom' | 'server_env';
}> {
  const key = (candidateKey !== undefined ? candidateKey : getStoredApiKey()).trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) {
    headers['x-gemini-api-key'] = key;
  }

  const res = await fetch('/api/ai/test-key', {
    method: 'POST',
    headers,
    body: JSON.stringify({ key }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Bağlantı hatası (HTTP ${res.status})`);
  }
  return data;
}

