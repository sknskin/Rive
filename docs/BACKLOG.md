# Rive 백로그

최종 갱신: 2026-08-19 (3차 전수조사 — 설계 부합성 14항목 검증 반영)
근거: 코드베이스 전수조사 2회(라우트/컴포넌트/데이터 모델/하이진 스캔/데드코드 스윕) + 제품 스펙 대조.
모든 항목은 코드에서 확인된 사실 기반이며, 항목마다 스펙 참조(§)와 근거를 병기한다.

## 현재 상태 요약

- 구현 완료: 핵심 루프(READ→스톱워치→저장→Today/Calendar), 도서 검색(Kakao+Google 폴백),
  Library/Book Detail(상태·별점·DNF 사유·타임라인), 수동 기록, Insights(기간·속도·시간대·요일),
  AI 취향 분석 온보딩 + Reading Profile + For You 추천/피드백(Gemini 실호출 검증 완료), 테마 3모드,
  dev 인디케이터 비활성화, 반응형 콘텐츠 폭(512→672→768px), 도서 메타 보강 파이프라인,
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
- 페이지 7개, API 라우트 4개, 컴포넌트 25개. 단위 테스트 52개 통과.
- 코드 하이진: TODO/FIXME/`any`/빈 catch/ts-ignore 0건 (3차 전수조사 재확인.
  유일 예외: theme.ts의 FOUC 방지 인라인 스크립트 문자열 내부 빈 catch — 무해).
- 설계 부합성 (2026-08-19 3차 조사): 스펙 핵심 원칙 14항목 전부 충족 판정 —
  READ 히어로, Minimal Input(필수 입력=종료 페이지 1개), 자동 이어읽기, 다중 Reading,
  Sheet 우선(중앙 modal 0건), 부정 메시지 0건, AI 책 창작 불가(인덱스 참조), AI 캐싱,
  통계 무AI, Empty state 행동 안내, 표지 폴백, 상태 전달형 애니메이션, 테마 3모드,
  Stopwatch 히어로(차순위 대비 약 3.5배).
- 환경: dev/start 포트 7001 (7000은 macOS AirPlay가 점유). `.env.local`에
  KAKAO_REST_API_KEY, GEMINI_API_KEY 설정 완료. AI 모델: gemini-3.6-flash
  (신규 키에서 2.5-flash 사용 불가 확인).

---

## P0 — 플로우 갭 (3차 전수조사 발견, 2026-08-19)

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

### 3. Supabase 전환 + 인증 (§70–77) — 사용자 지시로 보류 중
- 사실: 저장소 경계는 `src/lib/repository/types.ts` 인터페이스로 준비됨.
  `UserBook`에 스펙 §73의 `ownership`/`format` 필드 없음 — 전환 설계 시 함께 결정.

### 4. 배포 (§78) — 미착수
- Vercel/Cloudflare 중 선택, 환경변수(KAKAO/GEMINI) 등록 필요.

---

## P2 — 스펙 2차 기능 (§81)

| 항목 | 스펙 | 현재 사실 |
|---|---|---|
| Notes/Quotes 독립 관리 | §27 | `ReadingSession.memo`가 유일한 자유 텍스트. 인용구/독립 노트 엔티티 없음 |
| Reading Goals | §36 | 미구현 |
| ~~Heatmap~~ | §30 | **완료 (2026-08-19)** — Insights Activity 섹션, 최근 1년 53주 그리드, 강도 5단계, 모바일 가로 스크롤 |
| 과거의 오늘 | §28 | 미구현 |
| ~~예상 완독일~~ | §35 | **완료 (2026-08-19)** — 최근 30일 페이스 기반, Book Detail 진행률 아래 표시 (pageCount 필요 → Books API 키 제한 해제 후 실데이터 확인 가능) |
| Up Next | §37 | `want` 상태만 존재, Up Next 구분 없음 |
| Mood 추천 | §53 | Discover에 For You 섹션 하나뿐 |
| 시간 기반 추천 | §54 | 동일 |
| Taste Change | §47 | 미구현 |
| Reading DNA | §55 | 미구현 |

## P2 — 기능 완성도 갭

| 항목 | 스펙 | 현재 사실 |
|---|---|---|
| 완독 시 추가 평가(재미/몰입도/난이도 등) | §25 | 별점(1–5)만 존재 (`RatingStars`) |
| 추천 피드백 `Like` | §50 | 버튼 3개뿐(읽고 싶어요/이미 읽었어요/관심 없어요), `RecommendationStatus`에 like 없음 |
| 추천 카테고리 확장(Because You Loved 등) | §52 | For You만 |
| 온보딩 나이/성별(선택 항목) | §40–41 | 6단계에 미포함 |
| Library Grid/List 전환, 장르·저자·평점 필터 | §21 | 상태 칩 필터 + 3열 그리드 고정 |
| ~~Haptic Feedback~~ | §0-6 | **완료 (2026-08-19)** — READ 시작/STOP(탭 진동)·세션 저장(성공 패턴), 지원 기기 한정(navigator.vibrate) |
| 영문 라벨 혼용 정리 | — | 내비 5탭·페이지 제목 3·섹션 헤더 12·단위(pages, % Match)가 영문. 의도된 디자인인지 한글화할지 **사용자 결정 필요** (3차 조사 전수 목록 확보) |
| 장르 시간 가중치 중복 | §33 | 한 책의 여러 subject가 각각 독서 시간 전체를 가져가 합계가 부풀려짐 — 분배(1/n) 또는 대표 장르 1개 정책 검토 |

## P3 — 스펙 3차 기능 (§82)

- Monthly/Annual Wrapped (§58), AI Book Twin (§57), Reading Plan, 공유 이미지, Import/Export,
  Advanced Insights — 전부 미착수.

---

## 기술 부채 / 하우스키핑

1. **vitest.config.ts 로더 경고** — Vite가 `.mjs` 확장자 또는 `"type":"module"` 권고.
   현재 무해하나 `configLoader: 'native'`가 기본값이 되면 깨짐.
2. **컴포넌트/라우트 테스트 부재** — 단위 테스트는 순수 함수(포맷/통계/후보 정리/매퍼)만 커버.
3. **미사용 스캐폴드 잔재** — `src/app/page.module.css`(어디서도 import 안 됨),
   `public/*.svg` 5개. 삭제는 사용자 승인 필요.
4. **AI 추천 응답 시간** — 추천 파이프라인 실측 약 40초(키워드 생성→검색 4~6회→랭킹).
   로딩 UX 개선 또는 파이프라인 단축 검토 여지.
5. **추천 캐시의 category 필드 부재** — `AiRecommendation`에 카테고리 개념이 없어
   §52 확장 시 스키마 변경 필요.
6. **Google Books 키리스 쿼터** — 서버 IP 기준 429 제한을 실측. Kakao 키 부재 환경에서만
   영향. 필요 시 Google API 키 추가로 해결.
7. ~~TabBar 도달 불가 분기 + 낡은 주석~~ — **해결됨 (2026-08-18)**: 내비게이션 v2
   재작성에서 `enabled` 메커니즘 자체를 제거.
8. ~~저장소 데드 메서드~~ — **해결됨 (2026-08-19)**: 호출자 0건 재확인 후
   `getLastSessionForBook` 선언·구현 제거.
9. **쓰기 전용 필드(미완성 배선)** — 일부 해소 (2026-08-19): `AiProfile.analyzedAt`
   → ProfileCard에 "N월 N일 HH:MM 분석" 표시, `Book.kakaoUrl` → Book Detail "책 정보 ↗"
   외부 링크, `KakaoBookDocument.contents` → 등록 시 description 저장(이전 작업).
   잔여: `AiRecommendation.feedbackReason`(피드백 분석 미사용), `Book.googleBooksId`,
   `PreferenceProfile.updatedAt`, `BookSearchResponse.source`, `RangeSummary.sessionCount`.
10. **Book Detail 백필 논블로킹화 완료 (2026-08-19)** — 메타 백필이 첫 페인트를 막던
   문제 수정(실측 129ms), 보강 성공 시에만 재렌더.
