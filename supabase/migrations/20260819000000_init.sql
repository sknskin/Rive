-- Rive Supabase 스키마 v1 — 로컬(Dexie) 구조를 사용자별 서버 저장으로 전환
-- Rive Supabase schema v1 — per-user server storage mirroring the local Dexie layout
-- 설계: docs/superpowers/specs/2026-08-19-supabase-migration-design.md
-- 시각 값은 전부 epoch ms(bigint) — 통계는 클라이언트에서 계산한다 (설계 D5)
-- All timestamps are epoch ms (bigint); stats stay client-side (design D5)

-- ── books ─────────────────────────────────────────────────────────────
create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  authors text[] not null default '{}',
  publisher text not null default '',
  isbn13 text not null default '',
  cover_url text not null default '',
  page_count integer not null default 0,
  kakao_url text not null default '',
  google_books_id text not null default '',
  created_at bigint not null,
  description text,
  categories text[],
  enriched_at bigint,
  -- 복합 FK 대상 — 자식 테이블이 같은 사용자의 책만 참조하도록 강제한다
  -- Composite-FK target so children can only reference the same user's books
  unique (user_id, id)
);
-- isbn13 중복 등록 방지 — upsertBookByIsbn을 on conflict 단일 upsert로 대체 (6차 B4)
-- Prevents duplicate isbn13 rows; replaces the scan-then-insert upsert (audit 6 B4)
create unique index books_user_isbn13_key on public.books (user_id, isbn13)
  where isbn13 <> '';
create index books_user_idx on public.books (user_id);

-- ── user_books (서재 상태) ────────────────────────────────────────────
create table public.user_books (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  status text not null check (status in ('reading', 'want', 'read', 'paused', 'dnf')),
  current_page integer not null default 0,
  started_at bigint,
  finished_at bigint,
  created_at bigint not null,
  last_read_at bigint not null default 0,
  rating integer check (rating between 1 and 5),
  dnf_reason text,
  extra_ratings jsonb,
  up_next_at bigint,
  target_date bigint,
  primary key (user_id, book_id),
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);
create index user_books_status_idx on public.user_books (user_id, status);

-- ── reading_sessions ──────────────────────────────────────────────────
create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  started_at bigint not null,
  ended_at bigint not null,
  duration_seconds integer not null,
  start_page integer not null,
  end_page integer not null,
  pages_read integer not null,
  memo text not null default '',
  created_at bigint not null,
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);
create index reading_sessions_started_idx on public.reading_sessions (user_id, started_at);
create index reading_sessions_book_idx on public.reading_sessions (user_id, book_id);

-- ── active_sessions (사용자당 1행 — 고정키 "active" 대체, 6차 B3) ─────
create table public.active_sessions (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  started_at bigint not null,
  start_page integer not null,
  -- 책이 제거되면 진행 중 세션도 연쇄 삭제 — 고아 레코드 원천 차단
  -- Cascades with the book so no orphaned in-progress session can remain
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);

-- ── notes / quotes ────────────────────────────────────────────────────
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  content text not null,
  created_at bigint not null,
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);
create index notes_book_idx on public.notes (user_id, book_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null,
  page integer not null default 0,
  quote text not null,
  comment text not null default '',
  created_at bigint not null,
  foreign key (user_id, book_id) references public.books (user_id, id) on delete cascade
);
create index quotes_book_idx on public.quotes (user_id, book_id);

-- ── preferences (고정키 "primary" 대체 — 사용자당 1행) ────────────────
create table public.preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  favorite_genres text[] not null default '{}',
  disliked_genres text[] not null default '{}',
  loved_books jsonb not null default '[]',
  disliked_books jsonb not null default '[]',
  fiction_preference text not null check (fiction_preference in ('fiction', 'nonfiction', 'both')),
  reading_purposes text[] not null default '{}',
  age_range text,
  gender text,
  updated_at bigint not null
);

-- ── ai_profiles (고정키 "current" 대체 — 사용자당 1행) ────────────────
create table public.ai_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  profile_type text not null,
  summary text not null,
  genres jsonb not null default '[]',
  traits text[] not null default '{}',
  recommendation_factors text[] not null default '{}',
  evidence text[] not null default '{}',
  taste_changes text[],
  dna jsonb,
  book_twin jsonb,
  analyzed_at bigint not null
);

-- ── recommendations (book은 추천 시점 스냅샷 jsonb — 6차 C6) ──────────
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book jsonb not null,
  match_percent integer not null,
  reason text not null,
  category text,
  generated_at bigint not null,
  status text not null default 'active'
    check (status in ('active', 'want', 'liked', 'notInterested', 'alreadyRead')),
  feedback_reason text
);
create index recommendations_user_idx on public.recommendations (user_id, status);

-- ── goals (고정키 "current"+year 이중 관리 대체 — 연도별 1행) ─────────
create table public.goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year integer not null,
  target_books integer not null default 0,
  target_pages integer not null default 0,
  target_hours integer not null default 0,
  updated_at bigint not null,
  primary key (user_id, year)
);

-- ── wrapped ("2026-08" 자연키 → (user_id, period) 복합키) ─────────────
create table public.wrapped (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null,
  summary text not null,
  generated_at bigint not null,
  primary key (user_id, period)
);

-- ── RLS: 전 테이블 본인 행만 접근 (설계 D3·D4) ────────────────────────
-- RLS: every table restricted to the owner's rows (design D3, D4)
alter table public.books enable row level security;
alter table public.user_books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.active_sessions enable row level security;
alter table public.notes enable row level security;
alter table public.quotes enable row level security;
alter table public.preferences enable row level security;
alter table public.ai_profiles enable row level security;
alter table public.recommendations enable row level security;
alter table public.goals enable row level security;
alter table public.wrapped enable row level security;

create policy "own rows" on public.books
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.user_books
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.reading_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.active_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.quotes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.ai_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.recommendations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.goals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.wrapped
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── RPC: 활성 추천 원자 교체 (Dexie 트랜잭션 대체 — 6차 C5) ───────────
-- 피드백(want/liked/notInterested/alreadyRead)을 남긴 추천은 보존한다
-- Replaces active recommendations atomically; feedback rows are preserved
create or replace function public.replace_active_recommendations(p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.recommendations
  where user_id = auth.uid() and status = 'active';

  insert into public.recommendations
    (id, user_id, book, match_percent, reason, category, generated_at, status, feedback_reason)
  select
    coalesce(nullif(item ->> 'id', '')::uuid, gen_random_uuid()),
    auth.uid(),
    item -> 'book',
    (item ->> 'matchPercent')::integer,
    item ->> 'reason',
    item ->> 'category',
    (item ->> 'generatedAt')::bigint,
    coalesce(item ->> 'status', 'active'),
    item ->> 'feedbackReason'
  from jsonb_array_elements(p_items) as item;
end;
$$;

revoke execute on function public.replace_active_recommendations(jsonb) from anon, public;
grant execute on function public.replace_active_recommendations(jsonb) to authenticated;
