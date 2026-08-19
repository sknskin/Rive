-- Rive 마이그레이션 v3 — 이관/가져오기 원자화 RPC + RLS 정책 InitPlan 패턴
-- Rive migration v3 — atomic import RPC and InitPlan-style RLS policies

-- ── RLS 정책을 (select auth.uid())로 재작성 — 행마다 재평가되지 않게 (7차 권장)
-- Rewrite policies with (select auth.uid()) so it's evaluated once per query
do $$
declare
  t text;
begin
  foreach t in array array[
    'books', 'user_books', 'reading_sessions', 'active_sessions', 'notes', 'quotes',
    'preferences', 'ai_profiles', 'recommendations', 'goals', 'wrapped'
  ] loop
    execute format('drop policy "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

-- ── 이관/가져오기 원자화 — 전 테이블 upsert를 단일 트랜잭션으로 (7차 D4)
-- Atomic import — all table upserts in one transaction (audit 7 D4)
-- security invoker라 RLS가 그대로 적용되고, 중간 실패 시 전체가 롤백된다.
-- id 재매핑·행 검증은 클라이언트(uploadDomainTables)가 선행한다.
-- Invoker rights keep RLS in force; any failure rolls back everything.
create or replace function public.import_user_data(p jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer := 0;
  item jsonb;
begin
  for item in select * from jsonb_array_elements(coalesce(p -> 'books', '[]'::jsonb)) loop
    insert into public.books
      (id, title, authors, publisher, isbn13, cover_url, page_count, kakao_url,
       google_books_id, created_at, description, categories, enriched_at)
    values
      ((item ->> 'id')::uuid,
       item ->> 'title',
       coalesce(array(select jsonb_array_elements_text(item -> 'authors')), '{}'),
       coalesce(item ->> 'publisher', ''),
       coalesce(item ->> 'isbn13', ''),
       coalesce(item ->> 'coverUrl', ''),
       coalesce((item ->> 'pageCount')::integer, 0),
       coalesce(item ->> 'kakaoUrl', ''),
       coalesce(item ->> 'googleBooksId', ''),
       (item ->> 'createdAt')::bigint,
       item ->> 'description',
       case when item ? 'categories'
            then array(select jsonb_array_elements_text(item -> 'categories')) end,
       (item ->> 'enrichedAt')::bigint)
    on conflict (id) do update set
      title = excluded.title, authors = excluded.authors, publisher = excluded.publisher,
      isbn13 = excluded.isbn13, cover_url = excluded.cover_url,
      page_count = excluded.page_count, kakao_url = excluded.kakao_url,
      google_books_id = excluded.google_books_id, description = excluded.description,
      categories = excluded.categories, enriched_at = excluded.enriched_at;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'userBooks', '[]'::jsonb)) loop
    insert into public.user_books
      (book_id, status, current_page, started_at, finished_at, created_at, last_read_at,
       rating, dnf_reason, extra_ratings, up_next_at, target_date)
    values
      ((item ->> 'bookId')::uuid,
       item ->> 'status',
       coalesce((item ->> 'currentPage')::integer, 0),
       (item ->> 'startedAt')::bigint,
       (item ->> 'finishedAt')::bigint,
       (item ->> 'createdAt')::bigint,
       coalesce((item ->> 'lastReadAt')::bigint, 0),
       (item ->> 'rating')::integer,
       item ->> 'dnfReason',
       item -> 'extraRatings',
       (item ->> 'upNextAt')::bigint,
       (item ->> 'targetDate')::bigint)
    on conflict (user_id, book_id) do update set
      status = excluded.status, current_page = excluded.current_page,
      started_at = excluded.started_at, finished_at = excluded.finished_at,
      last_read_at = excluded.last_read_at, rating = excluded.rating,
      dnf_reason = excluded.dnf_reason, extra_ratings = excluded.extra_ratings,
      up_next_at = excluded.up_next_at, target_date = excluded.target_date;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'readingSessions', '[]'::jsonb)) loop
    insert into public.reading_sessions
      (id, book_id, started_at, ended_at, duration_seconds, start_page, end_page,
       pages_read, memo, created_at)
    values
      ((item ->> 'id')::uuid,
       (item ->> 'bookId')::uuid,
       (item ->> 'startedAt')::bigint,
       (item ->> 'endedAt')::bigint,
       coalesce((item ->> 'durationSeconds')::integer, 0),
       coalesce((item ->> 'startPage')::integer, 0),
       coalesce((item ->> 'endPage')::integer, 0),
       coalesce((item ->> 'pagesRead')::integer, 0),
       coalesce(item ->> 'memo', ''),
       (item ->> 'createdAt')::bigint)
    on conflict (id) do update set
      started_at = excluded.started_at, ended_at = excluded.ended_at,
      duration_seconds = excluded.duration_seconds, start_page = excluded.start_page,
      end_page = excluded.end_page, pages_read = excluded.pages_read, memo = excluded.memo;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'notes', '[]'::jsonb)) loop
    insert into public.notes (id, book_id, content, created_at)
    values
      ((item ->> 'id')::uuid, (item ->> 'bookId')::uuid,
       coalesce(item ->> 'content', ''), (item ->> 'createdAt')::bigint)
    on conflict (id) do update set content = excluded.content;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'quotes', '[]'::jsonb)) loop
    insert into public.quotes (id, book_id, page, quote, comment, created_at)
    values
      ((item ->> 'id')::uuid, (item ->> 'bookId')::uuid,
       coalesce((item ->> 'page')::integer, 0), coalesce(item ->> 'quote', ''),
       coalesce(item ->> 'comment', ''), (item ->> 'createdAt')::bigint)
    on conflict (id) do update set
      page = excluded.page, quote = excluded.quote, comment = excluded.comment;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'preferences', '[]'::jsonb)) limit 1 loop
    insert into public.preferences
      (favorite_genres, disliked_genres, loved_books, disliked_books,
       fiction_preference, reading_purposes, age_range, gender, updated_at)
    values
      (coalesce(array(select jsonb_array_elements_text(item -> 'favoriteGenres')), '{}'),
       coalesce(array(select jsonb_array_elements_text(item -> 'dislikedGenres')), '{}'),
       coalesce(item -> 'lovedBooks', '[]'::jsonb),
       coalesce(item -> 'dislikedBooks', '[]'::jsonb),
       item ->> 'fictionPreference',
       coalesce(array(select jsonb_array_elements_text(item -> 'readingPurposes')), '{}'),
       item ->> 'ageRange', item ->> 'gender',
       (item ->> 'updatedAt')::bigint)
    on conflict (user_id) do update set
      favorite_genres = excluded.favorite_genres, disliked_genres = excluded.disliked_genres,
      loved_books = excluded.loved_books, disliked_books = excluded.disliked_books,
      fiction_preference = excluded.fiction_preference,
      reading_purposes = excluded.reading_purposes, age_range = excluded.age_range,
      gender = excluded.gender, updated_at = excluded.updated_at;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'aiProfiles', '[]'::jsonb)) limit 1 loop
    insert into public.ai_profiles
      (profile_type, summary, genres, traits, recommendation_factors, evidence,
       taste_changes, dna, book_twin, analyzed_at)
    values
      (item ->> 'profileType', item ->> 'summary',
       coalesce(item -> 'genres', '[]'::jsonb),
       coalesce(array(select jsonb_array_elements_text(item -> 'traits')), '{}'),
       coalesce(array(select jsonb_array_elements_text(item -> 'recommendationFactors')), '{}'),
       coalesce(array(select jsonb_array_elements_text(item -> 'evidence')), '{}'),
       case when item ? 'tasteChanges'
            then array(select jsonb_array_elements_text(item -> 'tasteChanges')) end,
       item -> 'dna', item -> 'bookTwin',
       (item ->> 'analyzedAt')::bigint)
    on conflict (user_id) do update set
      profile_type = excluded.profile_type, summary = excluded.summary,
      genres = excluded.genres, traits = excluded.traits,
      recommendation_factors = excluded.recommendation_factors,
      evidence = excluded.evidence, taste_changes = excluded.taste_changes,
      dna = excluded.dna, book_twin = excluded.book_twin, analyzed_at = excluded.analyzed_at;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'recommendations', '[]'::jsonb)) loop
    insert into public.recommendations
      (id, book, match_percent, reason, category, generated_at, status, feedback_reason)
    values
      ((item ->> 'id')::uuid, item -> 'book',
       coalesce((item ->> 'matchPercent')::integer, 0), coalesce(item ->> 'reason', ''),
       item ->> 'category', (item ->> 'generatedAt')::bigint,
       coalesce(item ->> 'status', 'active'), item ->> 'feedbackReason')
    on conflict (id) do update set
      book = excluded.book, match_percent = excluded.match_percent,
      reason = excluded.reason, category = excluded.category,
      status = excluded.status, feedback_reason = excluded.feedback_reason;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'goals', '[]'::jsonb)) loop
    insert into public.goals (year, target_books, target_pages, target_hours, updated_at)
    values
      ((item ->> 'year')::integer,
       coalesce((item ->> 'targetBooks')::integer, 0),
       coalesce((item ->> 'targetPages')::integer, 0),
       coalesce((item ->> 'targetHours')::integer, 0),
       (item ->> 'updatedAt')::bigint)
    on conflict (user_id, year) do update set
      target_books = excluded.target_books, target_pages = excluded.target_pages,
      target_hours = excluded.target_hours, updated_at = excluded.updated_at;
    v_count := v_count + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p -> 'wrapped', '[]'::jsonb)) loop
    insert into public.wrapped (period, summary, generated_at)
    values
      (item ->> 'id', coalesce(item ->> 'summary', ''), (item ->> 'generatedAt')::bigint)
    on conflict (user_id, period) do update set
      summary = excluded.summary, generated_at = excluded.generated_at;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.import_user_data(jsonb) from anon, public;
grant execute on function public.import_user_data(jsonb) to authenticated;
