-- Rive 마이그레이션 v2 — Realtime 발행 + AI 일일 사용량 카운터
-- Rive migration v2 — realtime publication and daily AI usage counter

-- ── Realtime: 사용자 데이터 테이블 변경을 클라이언트로 푸시 (2차 B4 후속) ──
-- Realtime: push user-table changes to clients (phase-2 B4 follow-up)
alter publication supabase_realtime add table
  public.books,
  public.user_books,
  public.reading_sessions,
  public.active_sessions,
  public.notes,
  public.quotes,
  public.preferences,
  public.ai_profiles,
  public.recommendations,
  public.goals,
  public.wrapped;

-- ── AI 일일 사용량 — 사용자당 하루 호출 수 상한 (rate limit 1차) ──
-- Daily AI usage — per-user daily call cap (first-stage rate limit)
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

-- RLS는 켜되 정책은 만들지 않는다 — 클라이언트 직접 읽기/쓰기 차단,
-- 증가는 아래 security definer RPC로만 가능해 사용자가 카운터를 되돌릴 수 없다
-- RLS on with no policies: clients cannot touch the counter directly;
-- only the definer RPC below can increment it, so users cannot reset quotas
alter table public.ai_usage enable row level security;

create or replace function public.consume_ai_quota(p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    return false;
  end if;
  insert into public.ai_usage as usage_row (user_id, day, count)
  values (v_user, current_date, 1)
  on conflict (user_id, day)
  do update set count = usage_row.count + 1
  returning count into v_count;
  return v_count <= p_daily_limit;
end;
$$;

revoke execute on function public.consume_ai_quota(integer) from anon, public;
grant execute on function public.consume_ai_quota(integer) to authenticated;
