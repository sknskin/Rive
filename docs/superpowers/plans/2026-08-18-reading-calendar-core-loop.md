# Reading Calendar 핵심 루프 구현 계획

> **⚠️ 역사적 스냅샷 (2026-08-19 4차 전수조사 판정):** 이 문서는 1차 구현 당시 계획
> 그대로이며 이후 변경을 반영하지 않는다. 현행과 다른 대표 지점 — `getLastSessionForBook`
> 삭제됨(현재 `UserBook.currentPage` 사용), 하단 5탭 TabBar는 내비게이션 v2(모바일 드로어 +
> 데스크톱 상단 바)로 대체됨, `greetingForHour`는 `greetingForDate`로 변경됨,
> `page.module.css`는 사용자 승인 후 삭제됨. **최신 상태는 `docs/HANDOFF.md`, 최신 잔여는
> `docs/BACKLOG.md` 최하단을 기준으로 한다.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** READ → 스톱워치 → 종료 페이지 입력 → 저장 → Today/Calendar 반영까지의 핵심 루프와 도서 검색(Kakao 우선, Google Books 폴백)을 구현한다.

**Architecture:** 로컬 우선 — 모든 사용자 데이터는 Dexie(IndexedDB)에 저장하고 Repository 계층 뒤에 숨긴다. 서버 코드는 도서 검색 Route Handler 하나. 화면은 클라이언트 컴포넌트 중심, motion으로 Sheet/전환 애니메이션.

**Tech Stack:** Next.js 16.3.1 (App Router), React 19, TypeScript, Tailwind CSS v4, Dexie, motion

## Global Constraints

- 함수/메서드명 camelCase, 인덴테이션 2-space
- 주석은 한글+영어 각 1줄 (복잡한 로직에만)
- `any` 금지 (테스트 제외), 매직 넘버/스트링은 상수 분리
- 빈 catch 금지 — 모든 에러는 처리하거나 사용자에게 표시
- 깃 커밋 금지 (사용자가 명시 요청할 때만)
- 파일 삭제 금지 (사용자 확인 필요 — `page.module.css`는 미사용 상태로 남겨둠)
- 디자인: Neutral 기반, 라이트/다크 자동, Card 남용 금지, READ가 홈의 히어로
- Next 16 컨벤션: `LayoutProps<"/">`/`PageProps` 타입 헬퍼, Route Handler는 Web Request/Response
- 도서 검색 키: `.env.local`의 `KAKAO_REST_API_KEY` (이미 존재, 서버 전용)

---

### Task 1: 기반 설정 (Tailwind v4 + 의존성 + 디자인 토큰)

**Files:**
- Modify: `package.json` (의존성: `dexie`, `motion` / dev: `tailwindcss`, `@tailwindcss/postcss`)
- Create: `postcss.config.mjs`
- Modify: `src/app/globals.css` (전면 재작성)
- Modify: `src/app/layout.tsx`

**Steps:**
- [ ] `npm install dexie motion && npm install -D tailwindcss @tailwindcss/postcss`
- [ ] `postcss.config.mjs`: `{ plugins: { '@tailwindcss/postcss': {} } }`
- [ ] `globals.css`: `@import 'tailwindcss';` + `@theme` 토큰 정의
  - 색상: `--color-canvas`(배경), `--color-elevated`(시트/카드), `--color-ink`(본문), `--color-ink-secondary`, `--color-ink-tertiary`, `--color-accent`(READ 버튼 등, 라이트 `#1c1c1e`/다크 `#f2f2f7` — 무채색 액센트), `--color-tint`(포인트, iOS 블루 계열)
  - 다크: `@media (prefers-color-scheme: dark)`에서 CSS 변수 오버라이드
  - 시스템 폰트 스택: `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard Variable', sans-serif`
  - safe-area 패딩 유틸, `font-variant-numeric: tabular-nums` 유틸
- [ ] `layout.tsx`: Geist 폰트 제거 → 시스템 폰트, `lang="ko"`, metadata(title: "Rive", description), `viewport` (width=device-width, viewport-fit=cover, theme-color 라이트/다크)
- [ ] 검증: `npm run dev` 백그라운드 실행 후 페이지 로드 확인, `npm run build` 통과

### Task 2: 도메인 타입 + 상수

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/constants.ts`

**Interfaces (Produces):**

```ts
// types.ts
export type BookStatus = 'reading' | 'want' | 'read' | 'paused' | 'dnf';

export interface Book {
  id: string;            // uuid
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  coverUrl: string;      // 빈 문자열이면 placeholder
  pageCount: number;     // 0이면 미상
  kakaoUrl: string;
  googleBooksId: string;
  createdAt: number;     // epoch ms
}

export interface UserBook {
  bookId: string;
  status: BookStatus;
  currentPage: number;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  lastReadAt: number;    // READ Sheet 정렬용
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  startPage: number;
  endPage: number;
  pagesRead: number;
  memo: string;
  createdAt: number;
}

export interface ActiveSession {
  id: 'active';          // 단일 레코드 고정 키
  bookId: string;
  startedAt: number;
  startPage: number;
}

export interface BookSearchResult {
  title: string;
  authors: string[];
  publisher: string;
  isbn13: string;
  coverUrl: string;
  pageCount: number;
  kakaoUrl: string;
  googleBooksId: string;
}
```

```ts
// constants.ts
export const DB_NAME = 'rive';
export const DEFAULT_START_PAGE = 1;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_RESULT_SIZE = 10;
export const ACTIVE_SESSION_ID = 'active';
export const MIN_SESSION_SECONDS = 5; // 이보다 짧으면 오조작으로 간주해 저장 확인
```

- [ ] 위 파일 작성, `npx tsc --noEmit` 통과

### Task 3: Dexie DB + Repository 계층

**Files:**
- Create: `src/lib/db.ts` (Dexie 스키마)
- Create: `src/lib/repository/types.ts` (인터페이스)
- Create: `src/lib/repository/dexieRepository.ts` (구현)
- Create: `src/lib/repository/index.ts` (`getRepository()` 싱글턴)

**Interfaces (Produces):**

```ts
// repository/types.ts — Supabase 전환 시 이 인터페이스만 유지하면 됨
export interface ReadingRepository {
  // books
  upsertBookByIsbn(book: Omit<Book, 'id' | 'createdAt'>): Promise<Book>;
  getBook(bookId: string): Promise<Book | undefined>;
  // user books
  getUserBook(bookId: string): Promise<UserBook | undefined>;
  listUserBooksByStatus(status: BookStatus): Promise<UserBook[]>; // lastReadAt desc
  setBookStatus(bookId: string, status: BookStatus): Promise<void>;
  touchLastRead(bookId: string, currentPage: number, timestamp: number): Promise<void>;
  // sessions
  addSession(session: Omit<ReadingSession, 'id' | 'createdAt'>): Promise<ReadingSession>;
  listSessionsByDateRange(startMs: number, endMs: number): Promise<ReadingSession[]>;
  getLastSessionForBook(bookId: string): Promise<ReadingSession | undefined>;
  // active session
  getActiveSession(): Promise<ActiveSession | undefined>;
  startActiveSession(bookId: string, startPage: number, startedAt: number): Promise<void>;
  clearActiveSession(): Promise<void>;
}
```

Dexie 스키마: `books: 'id, isbn13'`, `userBooks: 'bookId, status, lastReadAt'`, `readingSessions: 'id, bookId, startedAt'`, `activeSession: 'id'`.
`upsertBookByIsbn`은 isbn13이 있으면 기존 레코드 재사용(중복 등록 방지), 없으면 title+authors로 매칭 시도 후 신규 생성. id는 `crypto.randomUUID()`.

- [ ] 작성 후 `npx tsc --noEmit` 통과

### Task 4: 시간/포맷 유틸

**Files:**
- Create: `src/lib/format.ts`

**Interfaces (Produces):**

```ts
export function formatStopwatch(totalSeconds: number): string;      // '00:42:18'
export function formatDurationShort(totalSeconds: number): string;  // '42분' | '1시간 7분'
export function formatTimeOfDay(ms: number): string;                // '21:10'
export function formatPageRange(startPage: number, endPage: number): string; // 'p.156 → p.184'
export function dayRange(date: Date): { startMs: number; endMs: number };    // 로컬 자정 기준
export function greetingForHour(hour: number): string; // '좋은 아침이에요' 등 시간대별 인사
```

- [ ] 작성 후 `npx tsc --noEmit` 통과 (vitest 승인 시 이 모듈부터 단위 테스트)

### Task 5: 도서 검색 Route Handler

**Files:**
- Create: `src/app/api/books/search/route.ts`
- Create: `src/lib/bookSearch/kakao.ts`
- Create: `src/lib/bookSearch/googleBooks.ts`
- Create: `src/lib/bookSearch/types.ts` (외부 API 응답 타입)

**동작:**
- `GET /api/books/search?q=...` → `{ results: BookSearchResult[], source: 'kakao' | 'google' }`
- `KAKAO_REST_API_KEY` 존재 시 Kakao(`https://dapi.kakao.com/v3/search/book`) 우선, 미존재/실패 시 Google Books(`https://www.googleapis.com/books/v1/volumes?q=`) 폴백
- 매퍼: Kakao `isbn`은 "isbn10 isbn13" 공백 구분 → 13자리 추출. Google `industryIdentifiers`에서 ISBN_13 추출. 표지: Kakao `thumbnail`, Google `imageLinks.thumbnail`(http→https 치환)
- 에러: 두 소스 모두 실패 시 502 + `{ error: '...' }`, q 누락 시 400. 각 fetch는 try/catch로 감싸고 실패 로그
- [ ] 작성 후 `curl 'localhost:3000/api/books/search?q=사피엔스'`로 Kakao 결과 확인, 키 제거 환경(로컬 env 변수 임시 해제한 셸)에서 Google 폴백 확인

### Task 6: 공용 UI 컴포넌트

**Files:**
- Create: `src/components/BottomSheet.tsx` — motion 기반. `open`, `onClose`, `title?`, children. 배경 dim 클릭/스와이프로 닫기, `AnimatePresence` 사용, 데스크톱(≥768px)에서는 중앙 하단 최대폭 제한 패널
- Create: `src/components/BookCover.tsx` — `coverUrl` 없으면 타이포 기반 placeholder (title 첫 글자들 + 은은한 배경), 사이즈 variant(`sm | md | lg`)
- Create: `src/components/TabBar.tsx` — 하단 고정 5탭 (Today `/`, Calendar `/calendar`, Library, Discover, Insights). Library/Discover/Insights는 비활성(준비 중) 스타일. `usePathname`으로 활성 표시. Reading Mode(`/read`)에서는 렌더하지 않음
- Modify: `src/app/layout.tsx` — TabBar 배치

- [ ] 작성 후 브라우저에서 탭바/시트 동작 확인

### Task 7: Today 홈 화면

**Files:**
- Modify: `src/app/page.tsx` (클라이언트 컴포넌트로 재작성)
- Create: `src/components/today/CurrentlyReading.tsx`
- Create: `src/components/today/TodaySessions.tsx`

**구성 (스펙 §3, §16):**
- 인사말(`greetingForHour`) → Currently Reading(최근 `lastReadAt` 책: 표지 md, 제목, 저자, `p.{currentPage} / {pageCount}`) → **READ 버튼(히어로, 화면에서 가장 강조)** → Today's Reading(오늘 세션 목록: 책 제목, `21:10 – 21:52`, `42분`, `p.156 → p.184`, `28 pages`) → Today Summary(총 시간/페이지/권수)
- Empty State: 기록 없으면 "오늘 아직 읽은 기록이 없어요." + READ 안내 (스펙 §0-10)
- 데이터는 `useEffect`에서 repository 로드, 로딩 중 스켈레톤 없이 자연스러운 fade-in
- 앱 진입 시 `getActiveSession()` 확인 → 존재하면 `/read`로 리다이렉트 (진행 중 세션 복구)
- [ ] 브라우저 확인 (데이터 없음/있음 두 상태)

### Task 8: READ Sheet + 도서 검색 + 시작 페이지 확인

**Files:**
- Create: `src/components/read/ReadSheet.tsx` — "무엇을 읽을까요?" 시트. 섹션: Continue Reading(최근 1권) / Reading(그 외 reading 책) / `새로운 책 찾기`
- Create: `src/components/read/BookSearch.tsx` — 시트 내 검색 화면. 입력 debounce(SEARCH_DEBOUNCE_MS) → `/api/books/search` 호출, 결과는 표지+제목+저자+출판사 + `읽기 시작`. 실패 시 재시도 안내
- Create: `src/components/read/StartPageConfirm.tsx` — "p.{n}에서 계속" + `수정`(숫자 입력 전환) + 시작 버튼
- Create: `src/lib/hooks/useStartReading.ts` — 책 선택→(신규면 upsert+status reading)→startActiveSession→`router.push('/read')` 공통 로직

**흐름 (스펙 §4–7):** 기존 책은 `getLastSessionForBook`의 endPage를 시작 페이지로 제안, 새 책은 DEFAULT_START_PAGE. 검색에서 선택한 새 책은 Library 자동 등록 + reading 상태.
- [ ] 브라우저에서 3경로(이어읽기/다른 책/검색 신규) 모두 Reading Mode 진입 확인

### Task 9: Reading Mode + STOP + 저장

**Files:**
- Create: `src/app/read/page.tsx`
- Create: `src/components/read/Stopwatch.tsx` — `startedAt` 기준 경과 계산(1초 interval + visibilitychange 재계산), tabular-nums 대형 타이포 (Hero)
- Create: `src/components/read/EndPageSheet.tsx` — "독서를 마쳤어요." + 소요시간 + "p.{start}에서 시작" + 종료 페이지 입력(필수, 숫자, 기본값 startPage) + 메모(선택) + 저장

**동작 (스펙 §8–13):**
- activeSession 없으면 `/`로 리다이렉트
- 화면: 책 제목, `p.{startPage}부터`, 스톱워치, STOP만. TabBar 숨김
- STOP → endedAt 고정 → EndPageSheet. MIN_SESSION_SECONDS 미만이면 "너무 짧은 기록" 안내와 취소 선택지
- 저장: `addSession`(pagesRead = endPage − startPage, 음수 입력 방어) → `touchLastRead` → `clearActiveSession` → Today로 전환. 저장 실패 시 입력값 유지 + 에러 표시
- 종료 페이지가 pageCount 이상이면 완독 여부 질문(예: status를 read로) — 1차에서는 간단한 확인만
- [ ] 전체 루프 브라우저 검증: READ→검색→시작→STOP→저장→Today 반영

### Task 10: Calendar 화면

**Files:**
- Create: `src/app/calendar/page.tsx`
- Create: `src/components/calendar/MonthGrid.tsx` — 월간 그리드. 셀: 날짜 숫자 + (세션 있으면) 작은 표지 1개 + `42m`/`2 sessions` 요약 (스펙 §17)
- Create: `src/components/calendar/DayDetail.tsx` — 선택 날짜의 세션 시간순 목록: 책 제목, 시간 범위, 시간, 페이지 범위, 페이지 수, 메모 (스펙 §18)
- Create: `src/lib/hooks/useMonthSessions.ts` — 월 범위 세션 로드 + 날짜별 그룹핑

**동작:** 월 이동(‹ ›), 오늘 표시, 날짜 탭 → 하단 상세가 부드럽게 등장. 미래 날짜는 비활성 톤.
- [ ] 브라우저 확인: 저장한 세션이 해당 날짜 셀과 상세에 표시

### Task 11: 최종 검증

- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과
- [ ] Playwright로 E2E 수동 검증: 홈 → READ → 검색("사피엔스") → 읽기 시작 → 수 초 후 STOP → 종료 페이지 저장 → Today 반영 → Calendar 반영 → 새로고침 후 데이터 유지 → Reading 중 새로고침 시 복구
- [ ] 라이트/다크 모드 스크린샷 확인
- [ ] 변경 파일 목록과 이유 요약 보고 (커밋은 하지 않음)
