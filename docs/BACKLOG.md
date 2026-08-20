# Rive 백로그

최종 갱신: 2026-08-20 (운영·권한 상태 재검증 및 세션 인수인계 정리)
근거: 소스·화면·데이터 계약·API·접근성·성능·배포 경계를 다중 전수조사하고 실패 주입·실제 브라우저·PostgreSQL 17로 검증.
모든 항목은 코드에서 확인된 사실 기반이며, 항목마다 스펙 참조(§)와 근거를 병기한다.

> **읽는 법:** 이 문서는 조사·구현 순서를 보존하는 연대기다. 중간의 “미착수”, “잔여”,
> 테스트 개수는 당시 스냅샷이며 뒤의 완료 기록이 이를 대체할 수 있다. 현재 실행 상태와
> 다음 작업 순서는 [`HANDOFF.md`](./HANDOFF.md), 현행 잔여는 이 문서 최하단 9차 섹션을
> 단일 기준으로 사용한다.

## 현재 상태 요약

- 구현 완료: 핵심 루프(READ→스톱워치→저장→Today/Calendar), 도서 검색(Kakao+Google 폴백),
  Library/Book Detail(상태·별점·DNF 사유·타임라인), 수동 기록, Insights(기간·속도·시간대·요일),
  AI 취향 분석 온보딩 + Reading Profile + For You 추천/피드백(Gemini 실호출 검증 완료), 테마 3모드,
  dev 인디케이터 비활성화, 반응형 콘텐츠 폭(512→672→lg 1024px, 데스크톱 2단), 도서 메타 보강 파이프라인,
  장르 분석 섹션, 시간대 6구간 인사말(일별 로테이션·1분 갱신),
  모드 연동 테마 아이콘(sun/moon/monitor).
- 내비게이션 v2 (2026-08-18, 사용자 지시로 스펙 §0-3 하단 탭 전제 변경):
  모바일 = 최상단 좌측 햄버거 → 좌측 드로어(5항목 + 최하단 테마 아이콘), 하단 탭바 제거.
  데스크톱/태블릿 = 상단 바(가운데 탭 + 우측 끝 테마 아이콘). Reading Mode에서는 모두 숨김.
- 시트 반응형 v2: 모바일 = 바텀 시트(하단 여백 40px+safe area), 데스크톱/태블릿 = 중앙
  다이얼로그(페이드+스케일). 공용 BottomSheet 하나로 전 시트 적용.
  버그 수정: 비레이어 `.pb-safe`가 Tailwind `pb-*`를 덮어써 시트 버튼이 바닥에 붙던 문제
  → safe area 가산형 `.pb-safe-4`/`.pb-safe-10` 유틸리티로 교체.
- 검증: 390/768/1280 3개 뷰포트 × 5개 라운드 연속 통과 (드로어 열기/이동/닫힘, 시트 여백
  실측, Reading Mode 내비 숨김, 가로 오버플로 0, 테마 시트 연결).
- 데스크톱 2단 레이아웃 (2026-08-19): 콘텐츠 폭 lg 1024px로 확대, lg↑ 화면별 분할 —
  Today(현재 책+READ / 오늘 기록), Calendar(그리드 / 날짜 상세), Book Detail(책 정보 /
  통계·소개·타임라인, 좌측 sticky), Insights(속도·시간대·요일 / 히트맵·장르),
  Discover(프로필 sticky / 추천), Library 6열. 모바일·태블릿은 기존 세로 스택 유지.
  6개 화면 좌/우 컬럼 좌표 실측 + 오버플로 0 + 모바일 회귀 확인.
- UX 스윕 수정 4건 (2026-08-19): 히트맵 초기 스크롤을 최신(우측 끝)으로, Book Detail
  타임라인 빈 문구 새 톤 적용, 추천 카드 버튼 줄바꿈 제거, 장르 라벨 폭 확대.
  전부 브라우저 실측 검증.
- 전역 책 추가 (2026-08-18): 상단 바/모바일 헤더의 + 버튼 → AddBookSheet
  (검색 → 바로 읽기 시작/읽는 중 추가/읽고 싶어요). 어느 메뉴에서든 이동 없이 책
  추가 가능. Calendar 수동 기록에 "새로운 책 검색" 추가(서재 밖 책 즉석 등록).
  LIBRARY_CHANGE_EVENT로 열려 있는 Library/Today가 이동 없이 즉시 갱신.
  검증 3라운드 연속 통과(Insights에서 관심 등록, Library 무이동 갱신, 모바일
  캘린더 새 책 기록 저장, 바로 읽기 시작 → Reading Mode).
- Today 첫 화면 v2 (2026-08-19): 날짜 캡션("8월 19일 수요일") + 인사말 볼드 헤드라인 계층.
  상태별 3분기 — ① 서재 완전 비어 있음 = 최초 실행 전용 히어로(뷰포트 중앙, 북 글리프 +
  "오늘의 첫 페이지, 같이 열어볼까요?" + READ) ② 오늘 기록 없음 = 단일 컬럼(데스크톱 중앙)
  ③ 기록 있음 = 데스크톱 2단(책+READ / TODAY). "오늘은 아직 기록이 없어요" 빈 상태 문구는
  사용자 지시로 제거. 주요 CTA 2계층 통일 — 히어로급(py-4·18px·tracking-wide·shadow·hover):
  Today/Book Detail READ, Discover 3종, 핵심 루프 확정 버튼 4종(읽기 시작/저장 2곳/온보딩
  다음), 시트 확인급(py-3.5·15px)은 기존 유지.
- 페이지 7개, API 라우트 6개(books 2·AI 4). 8차 최종 검증: Vitest
  22파일/132건 통과, coverage statements 28.55%·branches 25.45%·functions 23.08%·lines
  28.86%, Chromium 데스크톱·모바일 E2E 4건 통과, lint·typecheck·production build 통과.
- 코드 하이진: TODO/FIXME/`any`/빈 catch/ts-ignore 0건 (3차 전수조사 재확인.
  유일 예외: theme.ts의 FOUC 방지 인라인 스크립트 문자열 내부 빈 catch — 무해).
- 설계 부합성 (2026-08-19 3차 조사): 스펙 핵심 원칙 14항목 전부 충족 판정 —
  READ 히어로, Minimal Input(필수 입력=종료 페이지 1개), 자동 이어읽기, 다중 Reading,
  Sheet 우선(중앙 modal 0건), 부정 메시지 0건, AI 책 창작 불가(인덱스 참조), AI 캐싱,
  통계 무AI, Empty state 행동 안내(단 Today의 "오늘 기록 없음" 문구는 2026-08-19
  사용자 지시로 의도적 제거 — 예외), 표지 폴백, 상태 전달형 애니메이션, 테마 3모드,
  Stopwatch 히어로(차순위 대비 약 3.5배).
- 환경: dev/start 포트 7001 (7000은 macOS AirPlay가 점유). `.env.local`에
  KAKAO_REST_API_KEY, GEMINI_API_KEY 설정 완료. AI 모델: gemini-3.6-flash
  (신규 키에서 2.5-flash 사용 불가 확인).

---

## P0 — 플로우 갭 (3차 전수조사 발견 → **전건 해결, 2026-08-19**)

> A~E 5건 모두 구현 + 브라우저 E2E 검증 완료: A) EndPageSheet에 2탭 확인식 폐기 버튼,
> B) 세션 수정(프리필 시트)·삭제(진행 상태 재계산)·책 완전 제거(경고+2탭),
> C) 완독 저장 직후 별점 시트(건너뛰기 가능), D) notifyLibraryChange 누락 4곳 보완 +
> AddBookSheet 순서 역전 수정, E) 추천 want 후 "서재에서 보기" → /library?status=want.
> 원문 기록은 아래에 보존.

### A. 5초 이상 세션의 폐기 경로 부재 — 구조적 막다른 길
- 사실: 5초 미만 STOP에만 "기록하지 않고 종료"가 존재(`read/page.tsx` 짧은 세션 가드).
  5초 이상 세션은 종료 페이지를 입력하지 않으면 빠져나갈 수 없음 — 시트를 닫으면
  스톱워치로 복귀하고, 내비는 숨겨져 있고, 홈 접근 시 /read로 리다이렉트됨.
- 제안: EndPageSheet에 "기록하지 않고 종료"(확인 포함) 추가.

### B. 세션·책 수정/삭제 기능 전무 — 오입력 정정 수단 없음
- 사실: Repository에 deleteSession/updateSession/deleteBook 부재. 종료 페이지 오입력,
  수동 기록 시간 오입력, 잘못 등록한 책 모두 영구 데이터가 됨.
- 제안: 세션 삭제(+선택적 수정), 서재에서 책 제거(연관 세션 처리 정책 포함) 설계 필요.

### C. 완독 직후 별점 유도 없음 (스펙 §25)
- 사실: markAsRead 후 바로 Today 복귀. 별점은 Book Detail을 직접 찾아가야만 가능.
  별점은 AI 취향 분석 입력이라 수집률에 직결.
- 제안: 완독 저장 직후 별점 Sheet 1스텝 노출(건너뛰기 가능).

### D. 서재 갱신 이벤트 누락 4곳 + 순서 역전 1곳
- 미발행: ManualSessionSheet.handleSave(수동 기록 저장), Book Detail 상태 변경/별점,
  Discover want 등록. 순서 역전: AddBookSheet '바로 읽기 시작'에서 notify가
  await startNewBook보다 먼저 호출됨.
- 제안: notifyLibraryChange를 각 저장 성공 직후로 통일.

### E. Discover want 등록 후 Library 이동 경로 없음
- "읽고 싶은 책에 담았어요 ✓" 텍스트뿐 — 담긴 곳으로 가는 링크 없음.

## P1 — 다음 착수 권장

### 1. 도서 메타데이터 보강 — 구현 완료 (2026-08-18), Books API 활성화 대기
- 구현: `Book`에 `description`/`categories`/`enrichedAt` 추가, Kakao `contents`를
  description으로 즉시 저장, `/api/books/enrich`(Google Books ISBN→제목 폴백 조회),
  등록 시 백그라운드 보강 + Book Detail 지연 백필, 실패 시 재시도 안전.
- Book Detail에 책 소개(About, 더보기 토글)·장르 칩 표시. 완독 토글/진행률은
  pageCount 확보 시 자동 활성.
- **차단 해소 (2026-08-19)**: Open Library 폴백 추가로 구글 콘솔 작업 없이 동작.
  보강 체인 = Google Books(키 제한으로 현재 403) → **Open Library(키 불필요)**.
  실측: 사피엔스 636쪽+카테고리 5종, 데미안 239쪽 백필 → Book Detail 페이지 수·장르
  칩·Insights 장르 차트 실데이터 표시 확인.
- 참고: AI Studio가 만든 "Gemini API Key"는 특수 타입이라 키 제한에 다른 API를 추가할
  수 없음(체크박스 비활성 실측). Google Books 품질(설명·카테고리)이 필요해지면 표준
  API 키를 새로 만들어 `GOOGLE_BOOKS_API_KEY`에 넣으면 자동으로 Google 우선이 됨 — 선택 사항.
- 개선 여지: Open Library 카테고리는 영문 주제어(예: Bildungsromans) — 한글 장르
  매핑/정규화는 추후 과제.
- 잔여: `subtitle`/`publishedDate`/`language`/`isbn10` 필드는 여전히 없음 (스펙 §72,
  Supabase 스키마 설계 시 함께 결정).

### 2. Insights 장르 분석 — 구현 완료 (2026-08-18)
- `genreDistribution()` 순수 함수(+테스트 3개): 독서 시간을 책 카테고리에 배분.
  Insights에 Genres 섹션 추가. 데이터는 1번 활성화 후 채워짐.

### 3. Supabase 전환 + 인증 (§70–77) — **1차 구현 완료 (2026-08-19), E2E 일부 잔여**

구현 완료(설계: docs/superpowers/specs/2026-08-19-supabase-migration-design.md, 사용자 승인):
- 프로젝트 생성(Seoul, Free) + 스키마 적용 검증 — 11테이블 전부 RLS on, 정책 11,
  RPC(replace_active_recommendations). anon 읽기=빈 배열/쓰기=42501 차단 실측.
  마이그레이션: supabase/migrations/20260819000000_init.sql (psql 풀러로 적용).
- SupabaseRepository(전 메서드, snake_case 매핑, undefined→null 클리어 시맨틱 유지) +
  getRepository() 로그인 분기(localStorage rive-auth-mode 플래그, 설계 D1 로그인 선택제).
- removeBookCompletely는 복합 FK cascade로 대체(RPC 불필요 — 설계 §3에서 1개로 축소).
- 계정 UI: 설정 시트 최상단 계정 섹션(이메일 로그인/가입/로그아웃, 로그인 후 로컬 기록
  이관 프롬프트). 이관 모듈 migrateLocal.ts(참조 순서 upsert, 로컬 보존+플래그).
- AI 라우트 3개 인증 게이트(401 실측) + 본문 200K 상한 + excludeTitles 300 상한 +
  wrapped 입력 화이트리스트. 클라이언트 fetch 3곳 토큰 부착.
  ※ 설계 편차: books/search·enrich는 게이트 제외 — D1 로컬 모드(비로그인 책 검색)가
  핵심 루프라 우선. 배포 후 남용 시 재검토.
- 비로그인 로컬 모드 회귀 실측: Today/Library/Discover 기존 데이터 정상, 계정 섹션 렌더.

**E2E 완료 (2026-08-19, Confirm email 사용자 해제 후)**: 가입 → 즉시 세션 → 이관 프롬프트
→ 기록 옮기기(서버 psql 검증: 책 6·서재 6·세션 2·인용구 1·설문/프로필/목표·추천 6·리캡 2)
→ 서버 모드 전 화면(Today/Library/Insights/Discover/상세) → 서버 쓰기(노트 추가,
DB 확인 후 삭제 정리) → 로그아웃 → 로컬 모드 복귀 + 로컬 데이터 보존. 전 단계 통과.
테스트 계정: ehgml4523+e2etest@gmail.com (삭제 무방).

**2차(B 항목) 완료 (2026-08-19, 사용자 지시 "B부터 진행 — 소셜은 Google만, 나머지 권장대로")**:
- B3 Google 로그인: **전 구간 E2E 완료 (2026-08-19)** — 사용자가 Google Cloud OAuth
  클라이언트 + Supabase 공급자 + Redirect URL(localhost:7001) 설정 완료 후, 버튼 →
  구글 계정 선택/동의 → 복귀 → AuthSync 서버 모드 전환 → 새 계정(서버 데이터 0)의
  최초 실행 히어로 표시 → 로그아웃 → 로컬 데이터 복원까지 실측 통과.
  배포 시 Redirect URLs에 배포 도메인 추가 필요(DEPLOY.md 기재).
  발견된 엣지: 이관 플래그 기기 전역 문제 → 3차에서 계정별 키로 해소 완료.
- B4 다탭/다기기: 경량 구현(BroadcastChannel 다탭 + 창 복귀 재조회) — 실플로우 E2E
  통과. ※ Realtime 푸시는 3차에서 구현 완료(아래 3차 항목).
- B5 activeSession 충돌: useStartReading에 가드 — 진행 중 세션이 있으면 덮어쓰지 않고
  /read로 이동(이어읽기). 실측: 다른 책 READ 시도 시 세션 보존 확인.
- B6 서버 모드 백업 혼동: 캡션 명시로 1차 완화. ※ 서버 데이터 내보내기/가져오기는
  3차에서 구현 완료(아래 3차 항목, 캡션도 '계정 기록 대상'으로 갱신).
- B7 rate limit: 3차에서 1차 구현 완료(일 30회 쿼터, 아래 3차 항목) — 플랫폼 WAF는
  배포 후. B8 books 공유 카탈로그: 보류 유지.

**3차(후속 소과제) 완료 (2026-08-19)** — 마이그레이션 v2(20260819010000_realtime_quota.sql) 적용:
- **Realtime 푸시**: 사용자 테이블 9종 발행 등록 + AuthSync가 서버 모드에서 본인 행
  변경 구독(400ms 디바운스, 탭별 자체 구독이라 로컬 이벤트만 발행). 실측: psql로 서버
  제목 변경 → 브라우저 무이동 반영, 원복도 반영.
- **AI rate limit 1차**: ai_usage 테이블(RLS on·정책 없음 — 클라이언트 접근 불가) +
  security definer RPC consume_ai_quota, 일 30회 통합 상한. AI 라우트 3개에 429 연결.
  실측: RPC true→false 경계, 비로그인 42501 차단, 카운터 직접 조회 차단, 쿼터 소진 후
  라우트 429. 인프라 오류 시 fail-open(인증은 이미 통과).
- **서버 모드 내보내기/가져오기**: dataTransfer가 모드별 분기 — 서버 모드는 계정
  데이터를 로컬과 동일한 파일 형식으로 내보내고, 가져오기는 이관 업로더 재사용(upsert).
  실측: 내보낸 26개 항목 = 서버 행 수 합계 일치, 같은 파일 재가져오기 멱등 26건 성공.
  데이터 섹션 캡션도 "계정 기록 대상"으로 갱신.
- **이관 플래그 계정별 분리**: rive-local-migrated:<userId> 키로 변경 — 같은 기기에서
  다른 계정 로그인 시 이관 프롬프트 재노출 실측 확인. 업로더는 uploadDomainTables로
  분리(이관·서버 가져오기 공유).

당시 잔여였던 Vercel 배포는 2026-08-19 완료됐다(`docs/DEPLOY.md` 참조).
후속(보류 유지): books 공유 카탈로그(규모 확대 시), 플랫폼 레벨 rate limit(WAF —
남용 관측 시), Kakao OAuth.

#### (기록) 6차 조사 전환 체크리스트 원문
- 사실: 저장소 경계는 `src/lib/repository/types.ts` 인터페이스로 준비됨 — 6차 전수 검색
  결과 경계 유출 0건(예외는 dataTransfer.ts, 재작성 대상으로 주석 명시됨). 교체 대상은
  dexieRepository.ts 1개 + dataTransfer.ts + discover/page.tsx의 추천 ID 생성 1곳.
- **전환 전 필수(블로커)**:
  - B1. API 라우트 5개 인증·rate limit·body 크기 제한 부재 — 특히 ai/recommend는 요청
    1회 = Gemini 2회 + 검색 4~6회 + 약 40초 점유. ai/wrapped는 입력 무검증으로 임의
    JSON이 프롬프트에 삽입됨. mood/timeAvailable 등 프롬프트 인젝션 표면 존재.
    Supabase 인증 도입의 첫 수혜 지점 — 인증 게이트+사용자별 rate limit+배열/본문 상한.
  - B2. 클라이언트 ID 생성 5곳(crypto.randomUUID — repository 4곳 + discover 1곳) —
    서버는 gen_random_uuid() 기본값 + RLS user_id 강제로 전환.
  - B3. 고정 키 단일 레코드 5종(activeSession "active", preference "primary",
    aiProfile "current", goals "current", wrapped "YYYY-MM" 자연키) — 전부
    (user_id, …) 복합키 재설계. goals는 (user_id, year)로 가면 롤오버 코드 단순화.
  - B4. upsertBookByIsbn의 isbn 부재 시 전체 스캔+경합 — unique index + on conflict
    upsert로 대체. **books를 공유 카탈로그로 둘지 사용자별로 둘지가 최대 설계 결정**
    (updateBookMeta 쓰기 권한과 연동).
- **전환과 동시 결정**:
  - 타임스탬프 epoch ms ↔ timestamptz 정책. 시간대 의존 집계(dayRange·histogram 등
    8곳)는 클라이언트 계산 유지 권장(UTC 이동 시 체감 결과 변형).
  - activeSession 다기기 충돌 — 현재 무경고 덮어쓰기. 기기당 1세션 vs 사용자당
    1세션+확인 UI 결정 필요.
  - LIBRARY_CHANGE_EVENT(같은 탭 한정, 발행 11곳/구독 2곳) → Supabase Realtime 또는
    BroadcastChannel+포커스 재조회.
  - Dexie 트랜잭션 2곳(removeBookCompletely 6테이블, replaceActiveRecommendations)은
    Supabase JS로 원자성 불가 — plpgsql RPC로 구현.
  - 스키마 갭: ownership/format(§73), subtitle/publishedDate/language/isbn10(§72 —
    isbn10은 Kakao 응답에 있으나 현재 폐기), extraRatings·BookRef[]·추천 book 스냅샷·
    AiProfile 중첩 구조의 jsonb vs 정규화.
  - 이관 도구: exportAllData 페이로드가 단순해 서버 임포트에 재활용 가능 — user_id
    주입 + ID 재발급 여부 + EXPORT_VERSION↔Dexie 버전 연동 규칙 필요.
- **전환 전 코드 개선 — 완료 (2026-08-19, 브라우저 회귀 8지점 실측 통과)**:
  - ~~N+1 조회~~ → 저장소에 `listBooksByIds`(bulkGet 기반 Map 반환) 추가, 8곳 적용
    (Today 세션/과거의 오늘, behavior 2곳, Insights 리캡/장르, Library, ReadSheet).
    behavior.ts의 2N 중복도 배치 2회로 해소.
  - ~~독립 조회 순차 await~~ → Promise.all 병렬화 4곳(Discover, Insights 로드,
    Insights 리캡, Book Detail).
  - ~~mutation 가드 부재~~ → Book Detail 7개 핸들러에 busy 가드+finally 해제, 제거
    확인 버튼 disabled, NotesQuotes handleDelete에 deleting 가드.
  - 잔여: 낙관적 업데이트 0건(전 화면 await→전체 재조회 패턴)은 전환 시 화면별로 결정.
    useMonthSessions는 자체 캐시 보유로 배치 전환 제외.
- **사용자 액션 필요**: 마스터 스펙 §70~77·§72~73 원문을 docs/에 추가(스키마 확정 전제),
  배포 플랫폼 결정(rate limit 수단이 플랫폼 종속), Supabase 프로젝트 생성.

### 4. 배포 (§78) — **완료 (2026-08-19)**
- Vercel Hobby Production에 배포했고 환경변수와 GitHub `main` 자동 배포를 연결했다.

---

## P2·P3 버킷 완료 (2026-08-19, 버킷별 검증-작업 사이클로 진행)

전부 구현 + 브라우저 실측 검증(각 항목 E2E) + 테스트 60개·린트·타입체크·빌드 통과:

- **P2 14건**: Notes/Quotes(§27, Book Detail 관리+삭제), Goals(§36, 연간 목표+진행바 —
  검증 중 발견한 '세션 0건이면 진입점 소실' 결함 수정 포함), 과거의 오늘(§28, Today 섹션),
  Up Next(§37, Book Detail 토글+READ Sheet 별도 섹션), Mood 추천(§53)+시간 추천(§54,
  MoodSheet→추천 파이프라인 힌트, 컨텍스트 라벨), Taste Change(§47)+Reading DNA(§55)+
  AI Book Twin(§57 — 분석 1회 통합, DNA 슬라이더·트윈 실호출 렌더 확인), 완독 추가
  평가(§25, 별점 후 선택 2단계 — fun4/immersion5 저장 실측), Like 피드백(§50, 하트 토글
  + behavior.likedBooks로 AI 전달), 추천 카테고리(§52, 랭킹이 4종 배정→그룹 헤더),
  Library Grid/List 전환(§21), 온보딩 나이/성별(§40–41, 선택 스텝), 장르 시간 가중치
  1/n 분배.
- **P3**: Wrapped 월간/연간(§58, 통계 계산+AI 한 줄 요약 캐시 — 실호출·캐시 재사용 검증)
  + 공유 이미지(§82, 캔버스 PNG — 실제 다운로드 파일 육안 확인), Import/Export(§82,
  설정 시트에서 JSON 내보내기/병합 가져오기 — 가져오기 1건 IndexedDB 실측).
  ※ AI Book Twin·Reading Plan(완독 목표일 D-day·하루 페이지)은 P2에 통합 구현.
- **부채**: 라우트 테스트 8개 추가(search 폴백 체인·enrich OL 폴백, fetch 모킹),
  쓰기 전용 필드 배선 — feedbackReason→AI 신호, source→검색 출처 캡션,
  sessionCount→기간 타일 '기록 n회', googleBooksId→책 정보 링크 폴백.

### 잔여 (정직 기록)
- `PreferenceProfile.updatedAt` 미배선 — **설문 다시 하기 기능이 없어서** 표시 맥락도
  없음. 재온보딩 기능과 함께 처리할 것 (신규 항목).
- tasteChanges는 데이터 축적 전이라 AI가 빈 배열 반환(정상 동작) — 수개월 데이터 후 검증.
- 컴포넌트(React) 테스트는 여전히 없음 — jsdom+testing-library 의존성 승인 필요.

## P2·P3 원본 갭 표 정리 (4차 전수조사, 2026-08-19)

> 이전 판의 "P2 — 스펙 2차 기능"·"P2 — 기능 완성도 갭"·"P3 — 스펙 3차 기능" 표는
> 위 완료 섹션과 정면 모순(같은 기능을 완료이자 미구현으로 동시 기술)이라 제거했다.
> 4차 조사에서 코드 대조로 완료를 재확인한 항목: Notes/Quotes(§27), Goals(§36),
> Heatmap(§30), 과거의 오늘(§28), 예상 완독일(§35), Up Next(§37), Mood/시간 추천(§53–54),
> Taste Change(§47), Reading DNA(§55), 완독 추가 평가 저장(§25), Like(§50),
> 추천 카테고리(§52), 온보딩 나이/성별(§40–41), Library Grid/List(§21), Haptic(§0-6),
> 장르 1/n 가중치(§33), Wrapped(§58), Book Twin(§57), Reading Plan, 공유 이미지(§82),
> Import/Export(§82).
> 결정 기록: 영문 라벨 혼용은 의도된 디자인으로 유지 확정(2026-08-19 사용자 확정, 종결).

원본 표에서 실제로 남은 미구현 항목만 이월:

- **Library 장르·저자·평점 필터** (§21) — Grid/List 전환만 구현됨. 상태 칩 필터 외
  추가 필터 축 없음.
- **Advanced Insights** (§82) — 미착수.

---

## 기술 부채 / 하우스키핑

1. ~~vitest.config.ts 로더 경고~~ — **해결됨 (2026-08-19)**: `.mts` 전환 +
   `import.meta.dirname` 적용, 경고 0건 실측.
2. **컴포넌트/라우트 테스트 부재** — 단위 테스트는 순수 함수(포맷/통계/후보 정리/매퍼)만 커버.
3. ~~미사용 스캐폴드 잔재~~ — **해결됨 (2026-08-19)**: 사용자 승인 후
   `page.module.css` + `public/*.svg` 5개 삭제.
4. **AI 추천 응답 시간** — 추천 파이프라인 실측 약 40초(키워드 생성→검색 4~6회→랭킹).
   로딩 UX 개선 또는 파이프라인 단축 검토 여지.
5. ~~추천 캐시의 category 필드 부재~~ — **사실 아님, 정정 (6차 조사)**:
   `AiRecommendation.category`는 존재하고 사용 중(types.ts, discover 카테고리 그룹핑).
   §52 구현 완료 서술과 모순되던 낡은 항목이라 종결.
6. **Google Books 키리스 쿼터** — 서버 IP 기준 429 제한을 실측. Kakao 키 부재 환경에서만
   영향. 필요 시 Google API 키 추가로 해결.
7. ~~TabBar 도달 불가 분기 + 낡은 주석~~ — **해결됨 (2026-08-18)**: 내비게이션 v2
   재작성에서 `enabled` 메커니즘 자체를 제거.
8. ~~저장소 데드 메서드~~ — **해결됨 (2026-08-19)**: 호출자 0건 재확인 후
   `getLastSessionForBook` 선언·구현 제거.
9. **쓰기 전용 필드(미완성 배선)** — 대부분 해소 (2026-08-19): `AiProfile.analyzedAt`
   → ProfileCard 분석 시각, `Book.kakaoUrl`/`Book.googleBooksId` → Book Detail "책 정보 ↗"
   링크(카카오 우선), `KakaoBookDocument.contents` → description 저장,
   `AiRecommendation.feedbackReason` → behavior 신호, `BookSearchResponse.source` →
   검색 출처 캡션, `RangeSummary.sessionCount` → 기간 타일 "기록 n회".
   잔여(5차 조사 기준): `PreferenceProfile.updatedAt`(설문 다시 하기와 함께),
   `WrappedSummary.generatedAt`, `AiRecommendation.generatedAt`(정렬은 matchPercent만 사용),
   `ReadingSession.createdAt`(프로덕션 읽기 없음).
   ※ `UserBook.extraRatings`·`ReadingGoals.year`는 2026-08-19 해소(아래 4차 발견 A·B).
10. **Book Detail 백필 논블로킹화 완료 (2026-08-19)** — 메타 백필이 첫 페인트를 막던
   문제 수정(실측 129ms), 보강 성공 시에만 재렌더.

---

## 4차 전수조사 신규 발견 (2026-08-19)

코드 실측 결과: 테스트 60개·tsc·lint·빌드 전부 통과, 하이진 위반 0건,
P0 5건 및 P2·P3 완료 주장 20건 중 19건 코드와 정확히 일치. 아래는 신규 발견분.

### ~~A. `ReadingGoals.year` 연도 롤오버 결함~~ — **해결됨 (2026-08-19)**
- 원문: 저장 시 `year`를 기록하지만 읽지 않아, 해가 바뀌면 낡은 목표치와 새해 진행률이 병기.
- 수정: `insights/page.tsx` 로드 시 `goals.year !== 현재 연도`면 만료로 취급(null) —
  "올해 목표 세우기"로 재설정 유도, GoalsForm 프리필도 초기화.
- 검증: 브라우저 실측 — year=2025로 바꾸면 진행바·"목표 수정" 사라지고 "올해 목표 세우기"
  노출, 2026 복원 시 진행바 복귀.

### ~~B. `UserBook.extraRatings` 쓰기 전용~~ — **해결됨 (2026-08-19, 양쪽 모두 배선)**
- 수정 1: `BehaviorBookEntry.extraRatings` 추가(contracts.ts) + `collectBehaviorSnapshot`이
  값 있을 때 포함(behavior.ts) — §25 취향 분석 입력.
- 수정 2: Book Detail 완독 행에 "재미 4 · 몰입도 5" 형태 표기(별점 옆).
- 검증: 브라우저 실측 — extraRatings 저장 책 상세에서 라벨 노출 확인.

### ~~C. 저위험 정합성 2건~~ — **해결됨 (2026-08-19)**
- `dataTransfer.ts` 주석을 "activeSession 제외 전 테이블"로 사실에 맞게 수정.
- `removeBookCompletely` 트랜잭션에 activeSession 정리 추가 — 제거 대상 책의 진행 중
  세션이면 함께 삭제(고아 레코드 차단).

### D. 플랜/스펙 문서 낡음 (기록용)
- `docs/superpowers/plans/2026-08-18-reading-calendar-core-loop.md`: 삭제된
  `getLastSessionForBook`, 폐기된 하단 5탭 TabBar, `greetingForHour` 등 초기 설계 그대로 —
  역사적 스냅샷 문서로 간주(문서 상단에 주의 문구 추가함). 최신 상태는 본 BACKLOG가 기준.
- 스펙 변경 이력의 콘텐츠 폭 서술(768px)은 lg 1024px 확대 이전 세대 — 스펙 12행의
  "BACKLOG가 단일 기준" 위임에 따라 본 문서를 우선한다.

---

## 5차 전수조사 (2026-08-19) — 발견 및 처리

실측: 테스트 62개·tsc·lint·빌드 전부 통과. 미커밋 변경 5건(첫 화면 재설계, Goals 롤오버,
extraRatings, activeSession 정리, 버튼 통일)의 코드 정합성 검증 완료.

### 즉시 수정됨 (조사 직후 반영)
- **H1 최초 실행 판정 버그**: isFresh가 reading 책 유무만 봐서 want/paused/read만 있는
  사용자에게도 "책 검색부터" 히어로가 노출되던 문제 → 서재 총 권수 0 조건 추가
  (`page.tsx` hasAnyBook).
- **M1 버튼 통일 잔여 4건**: 핵심 루프 확정 버튼(StartPageConfirm 읽기 시작, EndPageSheet
  저장, ManualSessionSheet 저장, OnboardingWizard 다음/완료)에 히어로 마감 적용.
- 주석 요일 오류(format.ts 예시 화요일→수요일) 수정.

### 결함 아님 (기록)
- H2 "오늘은 아직 기록이 없어요" 소실 — 사용자 명시 지시로 제거된 것. Empty state 원칙의
  의도된 예외로 상태 요약에 기재.

### 단기·중기 일괄 처리 (2026-08-19, 사용자 지시 "전부 진행" — E2E 검증 포함)
- **M3 시트 접근성 해소**: BottomSheet에 Escape 닫기 + 열릴 때 패널 포커스(autoFocus 입력
  우선) + 닫힐 때 포커스 복귀 + `label` prop(aria-label) — 호출부 17곳 전부 라벨 부여.
  전역 `:focus-visible` 링(globals.css) 추가. Escape 닫기·라벨 브라우저 실측 확인.
  ※ 완전한 포커스 트랩(Tab 순환 가둠)은 미구현 — 잔여.
- **M7 해소**: pageCount=0 책도 완독 체크박스 노출(기본 해제, 도달 시 자동 체크는 유지).
- **M6 해소**: 세션 0개여도 완독 처리된 책이면 완독 행(완독일·별점·추가 평가) 렌더.
- **M4/M5 해소**: StatusSheet DNF 단계 "뒤로", ReadSheet 검색 뷰 "뒤로"·확인 뷰
  "다른 책 선택/다른 책 찾기" 추가. 브라우저 실측 확인.
- **M2 해소**: cursor-pointer 약 25곳 일괄 보정 (ReadSheet 내부 불일치 포함).
- **L급 처리**: L1(프롬프트에 extraRatings 척도 설명), L2(Today 날짜/인사말
  suppressHydrationWarning), L3(주석 요일), L5(위저드 이중 min-h-dvh → flex-1),
  L6(차트 all-zero 빈 문구), L7(WrappedSheet — !ctx/!blob 사용자 표시 에러),
  L10(aria-pressed — 라이브러리 칩·달력 날짜·무드/시간 칩·노트 탭·온보딩 옵션·상태 옵션),
  L11(검색·노트 입력 aria-label), L12(공용 PageSkeleton — read/discover/library/상세 4화면),
  L13(진행바 role="progressbar" — CurrentlyReading·장르바·GoalBar).

### 잔여 일괄 처리 2차 (2026-08-19 — "잔여 과제 진행" 지시)
- **포커스 트랩 완전판**: BottomSheet Tab/Shift+Tab 순환을 시트 안에 가둠 —
  Tab 10회·Shift+Tab 5회 모두 다이얼로그 내부 유지 실측.
- **L8**: HourBars/WeekdayBars에 role="img"+분포 요약 aria-label, YearHeatmap 스크롤
  컨테이너 tabIndex=0+region 라벨(키보드 스크롤 가능).
- **L9**: 추천 카드 3버튼 flex-wrap+min-w-[30%] — 좁으면 마지막 버튼이 줄바꿈.
- **L14**: BookCover fluid에 뷰포트 기반 sizes("(min-width:1024px) 160px, 33vw").
- **L15**: 백업 가져오기에서 앱보다 새 버전(version > EXPORT_VERSION) 거부.
- **신규**: getDb 최초 호출 시 `navigator.storage.persist()` 요청 — 브라우저 저장 공간
  정리로 IndexedDB가 지워질 위험 완화(최선 노력, 거부돼도 무해).

### 잔여 (최종 — 전부 미세/보류)
- L4(formatExtraRatingsLabel 렌더당 2회 호출 — 미세 성능), Wrapped 캐시 읽기 실패는
  console.error만(무해, 버튼 폴백 존재).
- 참고: 마스터 제품 스펙(§0~§86) 원문이 리포지토리에 없음 — 원문 대조가 필요하면 스펙
  문서를 docs/에 추가할 것.

---

## 6차 전수조사 (2026-08-19) — Supabase 전환 준비

- 소스 전수: Repository 경계 유출 0건, 하이진 위반 0건, 테스트 62·tsc·lint·빌드 통과.
  전환 체크리스트(B1~B4 블로커, 동시 결정 6건, 개선 권장 4건)는 P1-3 항목에 반영.
- 화면 실측 전수: 6개 라우트 × 3뷰포트(390/768/1280) 18지점 — 가로 오버플로 0,
  페이지 에러 0, 콘솔 에러 0. 핵심 루프 E2E(READ→선택→시작→스톱워치→STOP→종료 시트→
  완독 체크박스 조건→2탭 폐기→Today 복귀, DB 무변화) 통과. pageCount=0 책의 완독
  체크박스 상시 노출(M7 신규 동작)도 실기로 확인.
- 문서 정정: 부채 #5(category 부재 주장)는 사실 아님 — 종결. 컴포넌트 수 29개로 갱신.

---

## 7차 전수조사 (2026-08-19) — Supabase 전환 후 정합성

실측: 테스트 62·tsc·lint·빌드 전부 통과, 하이진 위반 0건, RLS 커버리지 누락 0건,
비밀값 클라이언트 유출 0건. 스키마·RPC 위생(definer 최소화, search_path 고정,
ai_usage 되돌리기 불가) 합격 판정.

### 발견 결함 처리 결과 (2026-08-19 당일 수정, 전건 실측 검증)
- **D1 해소**: 업로더가 업로드 전 서버 책 목록으로 (isbn13/제목+저자 → id) 매핑을 만들어
  로컬 id를 서버 id로 재매핑(자식 user_books/sessions/notes/quotes의 book_id 포함),
  서버에 있는 책은 재업로드하지 않음(중복·덮어쓰기 방지). **다기기 이관 E2E 통과** —
  새 브라우저 컨텍스트(기기 B)에 같은 ISBN·다른 UUID 책+세션 시드 → 로그인 → 이관 성공,
  서버 books 6 유지(중복 0)·세션 book_id가 서버 id로 재매핑됨을 psql로 확인.
- **D3 해소**: enterServerMode에서 플래그 저장 실패 시 진행 중단+로그아웃, 이관 실패
  화면에 "로그아웃하고 로컬 모드로 돌아가기" 버튼 추가.
- **D2 해소**: setServerMode가 성공 여부 반환 — AuthSync·AccountSection이 저장 실패 시
  리로드하지 않음(루프 원천 차단) + 안내 문구.
- **D4/D7 부분 해소**: 업로더에 사전 검증 추가 — status enum 검사, 깨진 book 참조 행
  제외(서버 기존 책 참조는 허용). 완전한 원자화(RPC 트랜잭션)는 후속.
- **D5 해소**: onAuthStateChange 구독(SIGNED_OUT 시 플래그 정리) + 창 복귀 시 세션
  재확인 후 재조회.
- **D6 해소**: 로컬 발행 직후 2초 창 내 Realtime 이벤트는 자기 에코로 판단해 스킵.
- books/search·enrich 입력 길이 상한(200자), updateBookMeta undefined 규칙 통일(null 클리어).

### 잔여 (P2 이하)
- **D8 쿼터 환불 — 의도적 보류**: 사용자 토큰으로 환불 RPC를 열면 사용자가 자기 쿼터를
  되돌릴 수 있어 상한 자체가 무력화됨. 서버 전용 신원(SUPABASE_SERVICE_ROLE_KEY)이 필요
  하므로 **배포 시 환경변수 추가와 함께 구현**. fail-open은 7차 조사에서 의도로 인정됨.
- 이관 완전 원자화(plpgsql RPC 트랜잭션), 미사용 export 9건(export 키워드 제거 수준),
  RLS 정책 (select auth.uid()) 패턴 전환(규모 커지면), 로컬 가져오기 행 검증(기존 부채).

### 잠재 부채 (현재 미행사 — 호출부가 가려줌)
- getGoals 연도 계약 차이(Dexie=저장행 그대로/Supabase=올해만), replaceActiveRecommendations
  (Dexie=upsert/RPC=insert), clearActiveSession의 gte(0) 관용구.

---

## 유사 앱 기능 리서치 (2026-08-19, 웹 검색 기반)

조사 대상: StoryGraph, Fable, Bookly, Bookmory, 북적북적. 상세 출처는 보고 메시지 참조.

이미 보유(경쟁 동등 이상): 타이머 기록, 연간 목표, 통계·히트맵·리캡, 노트/인용구,
Up Next, 예상 완독일, 무드 추천, 계정 동기화. **AI 취향 분석+실책 추천은 조사 대상
전부에 없는 차별점.**

적용 후보 (우선순위):
1. **독서 스트릭(연속 일수)** — Bookly/StoryGraph 공통 동기부여 장치. dailyTotals로
   즉시 계산 가능, 저비용. 스펙 '압박 없는 톤'에 맞게 담백하게.
2. **PWA 홈 화면 설치** — 네이티브 앱인 경쟁작들의 웹 대응물. manifest+아이콘, 저비용.
3. **전자책 % 단위 기록** — 북적북적. 페이지 수 없는 책 보완(기존 M7 완화와 연결).
4. **인용구 사진 OCR** — Bookly/Bookmory. 기존 Gemini 키로 구현 가능(비전 호출).
5. **ISBN 바코드 스캔** — BarcodeDetector API(크롬/안드로이드 한정, iOS 사파리 미지원).
6. **독서 리마인더 알림** — 웹 푸시 필요, PWA(2번)와 묶어 처리.
7. **버디 리드/북클럽(Fable)** — 소셜 확장, 대형 과제. 인증 기반은 준비됨.

부적합 판정: 커뮤니티 소싱 무드 태그·콘텐츠 워닝(커뮤니티 규모 전제),
책 탑 게이미피케이션(미니멀 디자인 원칙과 충돌 소지).

---

## 리서치 기능 1차 구현 (2026-08-19, 전건 실측 검증)

- **독서 스트릭**: currentStreakDays 순수 함수(+테스트 3개, 오늘 미기록 시 어제까지 인정)
  — Insights 헤더 아래 "N일 연속으로 읽고 있어요" (2일 이상일 때만, 압박 없는 톤).
  실측: 세션 어제 이동 시 "2일 연속" 노출, 원복 시 숨김.
- **PWA**: manifest.webmanifest + 아이콘 3종(192/512/apple 180 — 캔버스로 생성, 북 글리프)
  + layout 메타데이터(manifest·apple-touch-icon·appleWebApp). 실측: 링크 태그·파일 200.
- **페이지 수 수동 입력**: Book Detail에서 pageCount=0이면 "페이지 수 입력" 버튼 → 시트
  저장(updateBookMeta) → 완독 플로우·진행률·예상 완독일 활성화. 전자책은 100 입력으로
  % 기록 가능(시트에 안내 문구). 실측: 328 저장 → 캡션 반영·버튼 소멸.
- 다음 배치 후보: 인용구 사진 OCR(Gemini), ISBN 바코드 스캔(BarcodeDetector — iOS 웹
  미지원), 독서 리마인더(웹 푸시), 북클럽/버디 리드(대형).

---

## 리서치 기능 2차 + 컴포넌트 테스트 (2026-08-19, 전건 실측 검증)

- **인용구 사진 OCR**: /api/ai/quote-ocr (Gemini 비전, 인증+일일 쿼터+이미지 2MB 상한+
  MIME 화이트리스트) + gemini.ts에 이미지 입력 함수(온도 0.1). NotesQuotes 인용구 모드에
  "책 사진에서 문장 가져오기"(로그인 시에만 노출, 클라이언트에서 1024px/JPEG 압축).
  실측: 텍스트 이미지 → 원문 그대로 추출(줄바꿈 포함), 응답 약 26초.
- **ISBN 바코드 스캔**: BookSearch에 BarcodeDetector 기반 스캔(EAN-13, 978/979만 채택,
  카메라 해제 보장). 지원 브라우저에서만 버튼 노출(iOS 사파리 미지원 — 자동 숨김).
  실측: 지원 감지와 버튼 노출 일치. 실물 바코드 인식은 카메라 필요 — 기기 실측 잔여.
- **Library 장르·저자·평점 필터 (§21)**: 상태 칩 행에 "필터 N" 진입점 → 시트(장르·저자
  다중, 최소 별점 세그먼트, 실시간 "N권 보기", 초기화), 탭 전환 시 초기화, 결과 없음
  전용 안내. 실측: 저자 필터로 1권 축소·배지·초기화 동작.
- **컴포넌트 테스트 도입** (의존성 3종 사용자 승인: jsdom·@testing-library/react·jest-dom):
  vitest include에 .test.tsx 추가(파일별 jsdom docblock), 스모크 7개(RatingStars 상호작용,
  BookCover 플레이스홀더, 차트 빈 상태, PageSkeleton 접근성). **총 테스트 72개.**

### 당시 남은 과제 (이후 배포 완료 기록이 대체)
- **Vercel 배포** — 2026-08-19 완료. `docs/DEPLOY.md` 참조.
- 배포와 결합된 것: 독서 리마인더(웹 푸시 — HTTPS 도메인+서비스워커 필수), D8 쿼터 환불
  (service role 키), 플랫폼 WAF rate limit.
- 외부 콘솔 필요: Kakao OAuth(카카오 개발자 콘솔 앱 등록).
- 대형/설계 필요: 북클럽·버디 리드(Fable형 소셜), Advanced Insights(스펙 원문 부재),
  books 공유 카탈로그.
- 미세 잔여: 바코드 실기기(카메라) 실측만 남음.

---

## 품질 부채 일괄 처리 (2026-08-19, 마이그레이션 v4 적용·실측 검증)

- **이관/가져오기 완전 원자화 (7차 D4 완결)**: plpgsql RPC `import_user_data`(security
  invoker — RLS 그대로 적용) 신설, 10개 테이블 upsert를 단일 트랜잭션으로. 클라이언트
  업로더는 id 재매핑·검증 후 RPC 1회 호출로 축소. 실측: 서버 모드 재가져오기 26건 멱등
  성공, 실패 시 전체 롤백 보장.
- **RLS 정책 InitPlan 패턴**: 11개 정책 전부 `(select auth.uid())`로 재작성(psql로
  pg_policy 확인), anon 차단 재실측.
- **로컬 가져오기 행 검증**: 객체 아닌 행 필터(손상 파일 방어).
- **미사용 export 6건 정리**(AiGenreScore·THEME_STORAGE_KEY·THEME_CHANGE_EVENT·
  RiveDatabase·GoogleVolume 2종 — 전부 자기 파일 전용 확인 후 export 제거).
  ImportResult·AuthedRequestUser·SessionWithBook 3건은 공개 함수 시그니처의 일부라
  export 유지가 올바름 — 종결.
- 마이그레이션 파일: supabase/migrations/20260819020000_atomic_import.sql.

**당시 잔여 = Vercel 배포(이후 완료) + 배포 결합 3건(리마인더·쿼터 환불·
WAF) + 외부 콘솔(Kakao OAuth) + 대형(북클럽·Advanced Insights·공유 카탈로그) +
바코드 실기기 확인.**

---

## 배포 완료 (2026-08-19)

- **https://rive-ochre.vercel.app** — Vercel Hobby(무료), GitHub sknskin/Rive 연동
  (푸시하면 자동 재배포). 임시 스크린샷 41개 + .playwright-mcp 정리.
- 원격 검증: 홈·manifest·아이콘 200, /api/books/search 정상(환경변수 동작),
  /api/ai/* 무인증 401 차단.
- 배포 후 잔여 설정: Supabase URL Configuration에 배포 도메인 추가(Site URL +
  Redirect URLs — Google 로그인/메일 링크용, 사용자 진행).
- 배포로 풀린 후속 과제: 독서 리마인더(웹 푸시), D8 쿼터 환불(service key 등록 시),
  WAF rate limit(남용 관측 시).

---

## 8차 품질 전수조사 및 하드닝 (2026-08-19)

### 완료·검증

- **독서 세션 정합성**: 저장·수정·삭제와 진행률·상태·활성 타이머를 Dexie
  transaction/Supabase RPC로 묶음. 호출자 UUID 재사용, same-id 정정 재계산,
  책 소속 충돌 차단, `FOR UPDATE` 책 단위 직렬화, 활성 타이머 compare-delete 적용.
- **실패 주입**: fake-indexeddb로 롤백·재시도·정정·삭제, PostgreSQL 17에서
  migration·멱등성·잠금 대기·새 활성 타이머 보존을 실측.
- **백업·복원**: 필수 필드·범위·열거·FK 전체 사전 검증, 로컬 단일 transaction,
  서버 기존 책 ID 재매핑 및 unknown reference 전체 중단.
- **API·보안**: AI 4개 route runtime schema를 쿼터 차감 전에 검증. 인증 401·쿼터
  429·Gemini 502 계약 테스트, 외부 도서 API 8초 timeout·200자 상한·CDN cache,
  `nosniff`·frame/referrer/permissions 헤더 적용.
- **접근성·비동기**: drawer 포커스 트랩·Escape·복귀·스크롤 잠금, 입력 이름,
  live region/alert, reduced-motion CSS·MotionConfig, 검색 stale/abort, BroadcastChannel cleanup,
  Calendar batch lookup 검증.
- **자동 검증 기반**: coverage-v8, Chromium 데스크톱·모바일 E2E.
  최종 실측은 Vitest 22파일/132건, coverage 28.55/25.45/23.08/28.86%, Playwright 4건 통과.

### 외부 권한·제품 결정이 필요한 잔여

- **운영 Supabase migration**: `20260819030000_atomic_reading_sessions.sql`이 아직 운영
  schema cache에 없음(`PGRST202` 실측). DB/dashboard 인증이 없어 현재 세션에서 적용
  불가. 적용 전 계정 모드는 재시도 수렴형 호환 경로를 사용하므로 **서버 원자성은
  아직 완료로 간주하지 않는다**.
- **GitHub Actions 등록**: CI workflow 초안은 `.github/ci.yml`에 보존했지만 현재
  `sknskin` OAuth token에 `workflow` scope가 없어 `.github/workflows/ci.yml` 등록이
  거부됨. scope 승인 후 파일을 해당 경로로 옮겨 활성화해야 함.
- **비밀/인프라**: AI 실패 시 쿼터 환불(service-role 보호 설계), Vercel WAF/rate limit,
  Kakao OAuth, 실기기 바코드·카메라 검증.
- **제품 정책/대형 기능**: 재독 주기, 리마인더, 계정 삭제·비밀번호 재설정·개인정보
  문구, strict nonce CSP, 북클럽·버디 리드, 공유 카탈로그, Advanced Insights.

---

## 9차 문서·운영 인수인계 재검증 (2026-08-20)

### 새로 실측한 현재 상태

- `npm run verify`: Vitest 22파일/132건, coverage 28.55/25.45/23.08/28.86%, lint,
  typecheck, Next.js production build 전부 통과.
- `CI=1 npm run test:e2e`: Chromium desktop/mobile 4건 통과.
- 운영 홈 HTTP 200, 비로그인 AI profile HTTP 401, 보안 헤더 재확인.
- Vercel deployment `5984060799`가 commit `a24e212`를 Production `success`로 제공함을
  GitHub deployment API로 확인.
- 운영 `save_reading_session` RPC를 전체 parameter name으로 호출해도 `PGRST202`임을
  확인. 따라서 8차의 “운영 migration 미적용” 판정은 유효하다.
- GitHub 권한 재확인: `sknskin`은 저장소 push 권한은 있으나 OAuth `workflow` scope가
  없고, `dev-virgo`는 scope는 있으나 저장소 push 권한이 없다.

### 현행 잔여 — 다음 세션 실행 순서

1. **운영 DB 인증 확보 후** `20260819030000_atomic_reading_sessions.sql` 적용.
2. 전체 인자 RPC probe와 로그인 save/update/delete/active 보존 E2E로 운영 원자성 확인.
3. 그 검증이 끝난 뒤에만 `PGRST202` 호환 경로 제거.
4. `sknskin` OAuth에 `workflow` scope 승인 후 `.github/ci.yml`을
   `.github/workflows/ci.yml`로 이동·푸시하고 실제 Actions run 통과 확인.
5. 나머지 외부 권한·제품 과제는 사용자 지시가 생길 때 우선순위를 정해 진행.

명령, 기대 오류, 관련 파일, 금지할 오판까지 포함한 상세 인수인계는
[`HANDOFF.md`](./HANDOFF.md)에 기록했다. 다음 세션은 반드시 해당 문서부터 읽는다.
