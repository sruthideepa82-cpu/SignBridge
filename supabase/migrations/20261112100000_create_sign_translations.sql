-- Completed sign-to-text translations for signed-in users.
-- signs: the recognised words in signing order. recognition holds confidences and the model threshold only.
-- No camera frames, landmarks or video are stored.
create table public.sign_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  signs jsonb not null,
  text text not null,
  recognition jsonb,
  created_at timestamptz not null default now()
);

create index sign_translations_user_created_idx on public.sign_translations (user_id, created_at desc);

alter table public.sign_translations enable row level security;

create policy "Users can view own sign translations"
  on public.sign_translations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own sign translations"
  on public.sign_translations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own sign translations"
  on public.sign_translations for delete
  to authenticated
  using ((select auth.uid()) = user_id);
