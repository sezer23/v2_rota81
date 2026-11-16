-- One private planner record per signed-in user. Run in Supabase SQL Editor.
create table if not exists public.rota81_user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.rota81_user_state enable row level security;
revoke all on table public.rota81_user_state from anon, authenticated;
grant select, insert, update, delete on table public.rota81_user_state to authenticated;

drop policy if exists "Users can read their own Rota 81 data" on public.rota81_user_state;
create policy "Users can read their own Rota 81 data"
  on public.rota81_user_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Rota 81 data" on public.rota81_user_state;
create policy "Users can create their own Rota 81 data"
  on public.rota81_user_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Rota 81 data" on public.rota81_user_state;
create policy "Users can update their own Rota 81 data"
  on public.rota81_user_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Rota 81 data" on public.rota81_user_state;
create policy "Users can delete their own Rota 81 data"
  on public.rota81_user_state for delete to authenticated
  using ((select auth.uid()) = user_id);
