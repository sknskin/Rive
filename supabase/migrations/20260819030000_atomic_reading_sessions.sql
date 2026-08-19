-- Reading-session mutations must keep the session row, shelf progress and active timer consistent.
-- Caller-generated session ids make save retries idempotent after ambiguous network failures.

create or replace function public.save_reading_session(
  p_session jsonb,
  p_progress_mode text,
  p_mark_as_read boolean default false,
  p_clear_active boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid := (p_session ->> 'id')::uuid;
  v_book_id uuid := (p_session ->> 'bookId')::uuid;
  v_started_at bigint := (p_session ->> 'startedAt')::bigint;
  v_ended_at bigint := (p_session ->> 'endedAt')::bigint;
  v_duration_seconds integer := (p_session ->> 'durationSeconds')::integer;
  v_start_page integer := (p_session ->> 'startPage')::integer;
  v_end_page integer := (p_session ->> 'endPage')::integer;
  v_pages_read integer := (p_session ->> 'pagesRead')::integer;
  v_created_at bigint := (p_session ->> 'createdAt')::bigint;
  v_existing boolean;
  v_latest_end_page integer;
  v_latest_ended_at bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_progress_mode not in ('always', 'if-newer') then
    raise exception 'invalid progress mode: %', p_progress_mode;
  end if;
  if v_session_id is null or v_book_id is null or v_started_at is null or v_ended_at is null
    or v_duration_seconds is null or v_start_page is null or v_end_page is null
    or v_pages_read is null or v_created_at is null
    or v_ended_at < v_started_at or v_duration_seconds < 0
    or v_start_page < 0 or v_end_page < v_start_page or v_pages_read < 0 then
    raise exception 'invalid reading session';
  end if;

  -- Serialize every mutation for one user's book before touching its sessions or progress.
  perform 1
  from public.user_books
  where user_id = auth.uid() and book_id = v_book_id
  for update;

  if not found then
    raise exception 'userBook not found: %', v_book_id;
  end if;

  select exists (
    select 1 from public.reading_sessions
    where id = v_session_id and user_id = auth.uid() and book_id = v_book_id
  ) into v_existing;

  insert into public.reading_sessions
    (id, user_id, book_id, started_at, ended_at, duration_seconds,
     start_page, end_page, pages_read, memo, created_at)
  values
    (v_session_id, auth.uid(), v_book_id,
     v_started_at,
     v_ended_at,
     v_duration_seconds,
     v_start_page,
     v_end_page,
     v_pages_read,
     coalesce(p_session ->> 'memo', ''),
     v_created_at)
  on conflict (id) do update
  set
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    duration_seconds = excluded.duration_seconds,
    start_page = excluded.start_page,
    end_page = excluded.end_page,
    pages_read = excluded.pages_read,
    memo = excluded.memo,
    created_at = excluded.created_at
  where reading_sessions.user_id = auth.uid()
    and reading_sessions.book_id = excluded.book_id;

  -- A retry may hit the existing row. It must be the same user's same-book session.
  if not exists (
    select 1 from public.reading_sessions
    where id = v_session_id and user_id = auth.uid() and book_id = v_book_id
  ) then
    raise exception 'session id collision: %', v_session_id;
  end if;

  if v_existing then
    select end_page, ended_at into v_latest_end_page, v_latest_ended_at
    from public.reading_sessions
    where user_id = auth.uid() and book_id = v_book_id
    order by ended_at desc, created_at desc, id desc
    limit 1;
  end if;

  update public.user_books
  set
    current_page = case
      when v_existing then v_latest_end_page
      when p_progress_mode = 'always' or v_ended_at >= last_read_at then v_end_page
      else current_page
    end,
    last_read_at = case
      when v_existing then v_latest_ended_at
      when p_progress_mode = 'always' or v_ended_at >= last_read_at then v_ended_at
      else last_read_at
    end,
    status = case when p_mark_as_read then 'read' else status end,
    finished_at = case when p_mark_as_read then v_ended_at else finished_at end
  where user_id = auth.uid() and book_id = v_book_id;

  if not found then
    raise exception 'userBook not found: %', v_book_id;
  end if;

  if p_clear_active then
    -- Only clear the timer this save actually finalized. A newer timer from another tab survives.
    delete from public.active_sessions
    where user_id = auth.uid()
      and book_id = v_book_id
      and started_at = v_started_at
      and start_page = v_start_page;
  end if;
end;
$$;

create or replace function public.update_reading_session(
  p_session_id uuid,
  p_book_id uuid,
  p_patch jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created_at bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select created_at into v_created_at
  from public.user_books
  where user_id = auth.uid() and book_id = p_book_id
  for update;

  if not found then
    raise exception 'userBook not found: %', p_book_id;
  end if;

  update public.reading_sessions
  set
    started_at = case when p_patch ? 'startedAt' then (p_patch ->> 'startedAt')::bigint else started_at end,
    ended_at = case when p_patch ? 'endedAt' then (p_patch ->> 'endedAt')::bigint else ended_at end,
    duration_seconds = case when p_patch ? 'durationSeconds' then (p_patch ->> 'durationSeconds')::integer else duration_seconds end,
    start_page = case when p_patch ? 'startPage' then (p_patch ->> 'startPage')::integer else start_page end,
    end_page = case when p_patch ? 'endPage' then (p_patch ->> 'endPage')::integer else end_page end,
    pages_read = case when p_patch ? 'pagesRead' then (p_patch ->> 'pagesRead')::integer else pages_read end,
    memo = case when p_patch ? 'memo' then coalesce(p_patch ->> 'memo', '') else memo end
  where id = p_session_id and user_id = auth.uid() and book_id = p_book_id;

  if not found then
    raise exception 'session not found: %', p_session_id;
  end if;

  if exists (
    select 1 from public.reading_sessions
    where id = p_session_id and user_id = auth.uid() and book_id = p_book_id
      and (ended_at < started_at or duration_seconds < 0 or start_page < 0
        or end_page < start_page or pages_read < 0)
  ) then
    raise exception 'invalid reading session';
  end if;

  update public.user_books as ub
  set
    current_page = coalesce(latest.end_page, 0),
    last_read_at = coalesce(latest.ended_at, v_created_at)
  from lateral (
    select rs.end_page, rs.ended_at
    from public.reading_sessions rs
    where rs.user_id = auth.uid() and rs.book_id = p_book_id
    order by rs.ended_at desc, rs.created_at desc, rs.id desc
    limit 1
  ) latest
  where ub.user_id = auth.uid() and ub.book_id = p_book_id;
end;
$$;

create or replace function public.delete_reading_session(
  p_session_id uuid,
  p_book_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created_at bigint;
  v_end_page integer;
  v_ended_at bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select created_at into v_created_at
  from public.user_books
  where user_id = auth.uid() and book_id = p_book_id
  for update;

  if not found then
    raise exception 'userBook not found: %', p_book_id;
  end if;

  if exists (
    select 1 from public.reading_sessions
    where id = p_session_id and user_id = auth.uid() and book_id <> p_book_id
  ) then
    raise exception 'session does not belong to book: %', p_session_id;
  end if;

  delete from public.reading_sessions
  where id = p_session_id and user_id = auth.uid() and book_id = p_book_id;

  select end_page, ended_at into v_end_page, v_ended_at
  from public.reading_sessions
  where user_id = auth.uid() and book_id = p_book_id
  order by ended_at desc, created_at desc, id desc
  limit 1;

  update public.user_books
  set current_page = coalesce(v_end_page, 0),
      last_read_at = coalesce(v_ended_at, v_created_at)
  where user_id = auth.uid() and book_id = p_book_id;
end;
$$;

revoke execute on function public.save_reading_session(jsonb, text, boolean, boolean) from anon, public;
revoke execute on function public.update_reading_session(uuid, uuid, jsonb) from anon, public;
revoke execute on function public.delete_reading_session(uuid, uuid) from anon, public;
grant execute on function public.save_reading_session(jsonb, text, boolean, boolean) to authenticated;
grant execute on function public.update_reading_session(uuid, uuid, jsonb) to authenticated;
grant execute on function public.delete_reading_session(uuid, uuid) to authenticated;
