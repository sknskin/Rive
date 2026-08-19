# Rive — Supabase 전환(+인증) 설계

날짜: 2026-08-19
상태: 검토 대기 (도희)
근거: 6차 전수조사 체크리스트(docs/BACKLOG.md P1-3, B1~B4), 현행 코드 실측. 스펙 §70~77 원문은
리포에 없어 BACKLOG 2차 서술 기준 — 원문 수령 시 본 문서에 반영.

## 0. 핵심 결정 (권장안)

| # | 결정 | 권장 | 이유 |
|---|---|---|---|
| D1 | 로그인 정책 | **선택제** — 비로그인은 지금처럼 로컬(Dexie), 로그인하면 Supabase | 로컬 우선 원칙 유지, 기존 사용자 무중단. 배포 후에도 앱이 계정 강요 없이 동작 |
| D2 | 인증 방식 | **이메일+비밀번호** (1차). Google/Kakao OAuth는 후속 | 외부 콘솔 설정 0으로 즉시 동작. Supabase Auth 기본 제공 |
| D3 | books 소유 | **사용자별**(user_id 소유). 공유 카탈로그는 후속 최적화 | RLS가 단순해지고(전 테이블 동일 정책), updateBookMeta의 타인 데이터 수정 문제가 원천 차단. 중복 저장 비용은 이 규모에서 무시 가능 |
| D4 | ID 생성 | **클라이언트 UUID 유지** + RLS로 보호 | Repository 인터페이스 무변경. insert 시 `user_id = auth.uid()` CHECK로 타인 행 생성/덮어쓰기 불가. UUIDv4 충돌은 실질 0 |
| D5 | 타임스탬프 | **epoch ms bigint 그대로 저장**, 통계는 클라이언트 계산 유지 | 변환 계층 불필요. SQL 집계로 옮기면 UTC 기준이 되어 시간대 통계가 왜곡됨(6차 C2) |
| D6 | activeSession | **사용자당 1행** (user_id PK). 다기기 동시 시작 시 덮어쓰기는 1차에서 허용하고 문서화, 확인 UI는 후속 | 현행 단일 세션 전제 유지. 충돌 UI는 실사용 후 판단 |

## 1. 아키텍처

- `getRepository()`가 세션 유무로 분기: 세션 없음 → 기존 `DexieRepository`, 세션 있음 →
  신규 `SupabaseRepository`. **두 구현 모두 `ReadingRepository` 인터페이스만 노출** — 화면
  코드는 무변경이 원칙.
- 클라이언트: `@supabase/supabase-js` + `@supabase/ssr`(Next App Router 쿠키 세션).
  **⚠ 신규 의존성 — 사용자 승인 필요.**
- 화면 갱신: 1차는 기존 LIBRARY_CHANGE_EVENT 유지(같은 탭). 다탭/다기기 Realtime은 후속.
- AI/도서 API 라우트: `Authorization: Bearer <access_token>` 필수화 —
  `supabase.auth.getUser(token)` 검증 헬퍼를 5개 라우트 공용으로 추가(비로그인 로컬 모드
  사용자는 AI 기능에 로그인 안내). 입력 상한(본문 크기, excludeTitles 길이 등) 동시 적용.
  플랫폼 rate limit은 Vercel 배포 시 후속.

## 2. 스키마 (전 테이블 RLS: `user_id = auth.uid()` 전 연산)

컬럼 명명은 snake_case, 시각은 전부 bigint(epoch ms). `user_id uuid not null default auth.uid()`.

- `books` — id uuid PK, user_id, title, authors text[], publisher, isbn13, cover_url,
  page_count int, description, categories text[], enriched_at, kakao_url, google_books_id,
  created_at. **unique(user_id, isbn13) where isbn13 <> ''** → upsertBookByIsbn을
  `on conflict` 단일 upsert로 대체(6차 B4). isbn 없는 책의 제목+저자 매칭은 클라이언트 유지.
- `user_books` — PK(user_id, book_id), status, current_page, started_at, finished_at,
  last_read_at, added_at, rating, dnf_reason, extra_ratings jsonb, up_next_at, target_date.
  FK(user_id, book_id)→books **on delete cascade**.
- `reading_sessions` — id uuid PK, user_id, book_id, started_at, ended_at,
  duration_seconds, start_page, end_page, pages_read, memo, created_at.
  FK cascade. index(user_id, started_at), index(user_id, book_id).
- `active_sessions` — **PK user_id** (사용자당 1행), book_id, start_page, started_at.
- `notes` / `quotes` — id uuid PK, user_id, book_id, …현행 필드. FK cascade.
- `preferences` — **PK user_id**, favorite_genres text[], disliked_genres text[],
  loved_books jsonb, disliked_books jsonb, fiction_preference, reading_purposes text[],
  age_range, gender, updated_at. (고정키 "primary" 대체 — 6차 B3)
- `ai_profiles` — **PK user_id**, profile_type, summary, genres jsonb, traits text[],
  recommendation_factors text[], evidence text[], taste_changes text[], dna jsonb,
  book_twin jsonb, analyzed_at. (고정키 "current" 대체)
- `recommendations` — id uuid PK, user_id, book jsonb(추천 시점 스냅샷 보존 — 6차 C6),
  match_percent, reason, category, status, feedback_reason, generated_at.
- `goals` — **PK(user_id, year)**, target_books, target_pages, target_hours, updated_at.
  → 클라이언트의 연도 롤오버 판정 코드가 단순 조회로 대체됨.
- `wrapped` — **PK(user_id, period)** (period = "2026-08"/"2026"), summary, generated_at.

## 3. RPC (Dexie 트랜잭션 대체 — 6차 C5)

1. `remove_book_completely(p_book_id uuid)` — 본인 소유 확인 후 active_sessions 조건부
   삭제 + books 삭제(연쇄로 user_books/sessions/notes/quotes 정리).
2. `replace_active_recommendations(p_items jsonb)` — status='active' 삭제 + 신규 일괄
   삽입을 한 함수에서. 피드백 남긴 추천 보존 의도 유지.

## 4. 로컬 → 서버 데이터 이관

- 로그인 직후 로컬 Dexie에 데이터가 있으면 "기존 기록을 계정으로 옮길까요?" 시트 노출.
- 이관 = exportAllData 페이로드 재사용: 테이블별로 user_id를 붙여 순서대로
  insert(books → user_books → sessions → notes/quotes → preferences → ai_profiles →
  recommendations → goals → wrapped). ID는 로컬 UUID 유지(D4).
- 성공 시 로컬 DB는 지우지 않고 "이관됨" 플래그만 localStorage에 기록(안전).
  실패 시 부분 재시도 가능하도록 id 기준 upsert.

## 5. 구현 단계 (검증 사이클 포함)

1. 마이그레이션 SQL(스키마+RLS+RPC) 작성 → Supabase에 적용 → 대시보드/REST로 검증
2. 의존성 설치(승인 후) + Supabase 클라이언트/Auth 헬퍼 + 로그인/회원가입 시트(설정에 진입점)
3. `SupabaseRepository` 구현(인터페이스 36+1 메서드) + `getRepository()` 분기
4. AI/도서 라우트 인증 게이트 + 입력 상한
5. 이관 플로우 + E2E 검증(회원가입→이관→전 화면 실측→로그아웃 시 로컬 모드 복귀)
6. 문서/BACKLOG 갱신

## 6. 1차 범위에서 제외 (후속)

Google/Kakao OAuth, Supabase Realtime(다탭/다기기 갱신), 다기기 activeSession 확인 UI,
공유 book 카탈로그, 플랫폼 rate limit(Vercel WAF/Upstash), 설문 다시 하기(+updatedAt 표시).
