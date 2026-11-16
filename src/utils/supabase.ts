import { createClient } from '@supabase/supabase-js';
import type { PersistedPlannerState } from '../types/persistence';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isCloudConfigured = Boolean(url && publishableKey);

export const supabase = isCloudConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function loadPlannerState(userId: string): Promise<PersistedPlannerState | null> {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış.');
  const { data, error } = await supabase
    .from('rota81_user_state')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as PersistedPlannerState | undefined) ?? null;
}

export async function savePlannerState(
  userId: string,
  state: PersistedPlannerState
): Promise<void> {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış.');
  const { error } = await supabase.from('rota81_user_state').upsert(
    { user_id: userId, data: state, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}
