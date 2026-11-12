-- Learn Signs progress for signed-in users: one row per user and sign.
-- sign_id uses the same ids as frontend/src/data/signLibrary.js, for example 'alphabet:A'.
create table public.learn_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  sign_id text not null,
  completed boolean not null default false,
  favourite boolean not null default false,
  last_practised_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, sign_id)
);

alter table public.learn_progress enable row level security;

create policy "Users can view own learn progress"
  on public.learn_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own learn progress"
  on public.learn_progress for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own learn progress"
  on public.learn_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own learn progress"
  on public.learn_progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);
