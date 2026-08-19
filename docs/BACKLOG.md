# Rive 백로그

최종 갱신: 2026-08-19 (6차 전수조사 — Supabase 전환 준비 소스 전수 + 화면 실측 전수, P1-3 체크리스트 확정)
근거: 코드베이스 전수조사 4회(라우트/컴포넌트/데이터 모델/하이진 스캔/데드코드 스윕) + 제품 스펙 대조.
모든 항목은 코드에서 확인된 사실 기반이며, 항목마다 스펙 참조(§)와 근거를 병기한다.

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
- 페이지 7개, API 라우트 5개(books/search·books/enrich·ai/profile·ai/recommend·ai/wrapped),
  컴포넌트 29개(PageSkeleton 포함). 단위 테스트 62개 통과 (6차 전수조사 실측).
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
  발견된 엣지(후속): rive-local-migrated 플래그가 기기 전역이라, A 계정으로 이관한
  기기에서 B 계정으로 로그인하면 이관 버튼이 안 뜸 — 계정별 플래그로 개선 여지.
- B4 다탭/다기기: Realtime 대신 경량 구현 — LIBRARY_CHANGE_EVENT에 BroadcastChannel
  다탭 전파 + AuthSync의 창 복귀(visibilitychange) 재조회(서버 모드). 실플로우 E2E:
  탭A 책 추가/제거 → 탭B(/library) 무이동 반영 확인. Realtime 푸시는 후속 유지.
- B5 activeSession 충돌: useStartReading에 가드 — 진행 중 세션이 있으면 덮어쓰지 않고
  /read로 이동(이어읽기). 실측: 다른 책 READ 시도 시 세션 보존 확인.
- B6 서버 모드 백업 혼동: 설정 데이터 섹션에 "이 기기의 로컬 기록 대상" 캡션(서버 모드
  한정). **서버 데이터 전체 내보내기는 후속**(서버 자체가 내구 저장이라 우선순위 낮음).
- B7 rate limit / B8 books 공유 카탈로그: 권장대로 **배포 후 관측 기반으로 보류**.

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

잔여: **Vercel 배포 — 사용자 지시로 최후순위 보류, 준비 완료** (docs/DEPLOY.md).
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

### 4. 배포 (§78) — 미착수
- Vercel/Cloudflare 중 선택, 환경변수(KAKAO/GEMINI) 등록 필요.

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
