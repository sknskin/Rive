# Rive 백로그

최종 갱신: 2026-08-19 (4차 전수조사 — P2·P3 완료 주장 20건 코드 대조 재검증, 문서 모순 정리)
근거: 코드베이스 전수조사 4회(라우트/컴포넌트/데이터 모델/하이진 스캔/데드코드 스윕) + 제품 스펙 대조.
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
- 페이지 7개, API 라우트 5개(books/search·books/enrich·ai/profile·ai/recommend·ai/wrapped),
  컴포넌트 28개. 단위 테스트 60개 통과 (4차 전수조사 실측).
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

### 3. Supabase 전환 + 인증 (§70–77) — 사용자 지시로 보류 중
- 사실: 저장소 경계는 `src/lib/repository/types.ts` 인터페이스로 준비됨.
  `UserBook`에 스펙 §73의 `ownership`/`format` 필드 없음 — 전환 설계 시 함께 결정.

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
5. **추천 캐시의 category 필드 부재** — `AiRecommendation`에 카테고리 개념이 없어
   §52 확장 시 스키마 변경 필요.
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
   잔여(4차 조사 실측): `PreferenceProfile.updatedAt`(설문 다시 하기와 함께),
   `UserBook.extraRatings`(아래 4차 발견 참조), `ReadingGoals.year`(아래 4차 발견 참조),
   `WrappedSummary.generatedAt`, `AiRecommendation.generatedAt`(정렬은 matchPercent만 사용),
   `ReadingSession.createdAt`(프로덕션 읽기 없음).
10. **Book Detail 백필 논블로킹화 완료 (2026-08-19)** — 메타 백필이 첫 페인트를 막던
   문제 수정(실측 129ms), 보강 성공 시에만 재렌더.

---

## 4차 전수조사 신규 발견 (2026-08-19)

코드 실측 결과: 테스트 60개·tsc·lint·빌드 전부 통과, 하이진 위반 0건,
P0 5건 및 P2·P3 완료 주장 20건 중 19건 코드와 정확히 일치. 아래는 신규 발견분.

### A. `ReadingGoals.year` 연도 롤오버 결함 — 유일한 기능적 결함
- 사실: `insights/page.tsx`가 저장 시 `year`를 기록하지만 어디서도 읽지 않음.
  헤더는 현재 연도, 목표치는 저장 당시 연도 값(고정 키 `"current"`), 진행률은 올해 누적.
- 결과: 해가 바뀌면 "Goals 2027" 아래 2026년 목표치와 2027년(거의 0) 진행률이 병기되고,
  GoalsForm도 작년 숫자를 프리필. 연도 비교/자동 리셋 로직 없음.
- 제안: 로드 시 `goals.year !== 현재 연도`면 목표 재설정 유도(또는 연도별 키로 저장).

### B. `UserBook.extraRatings` 쓰기 전용 — 소비처 부재
- 사실: 완독 2단계 평가(read/page.tsx)에서 저장하지만 읽는 코드가 전무.
  Book Detail은 rating·dnfReason만 렌더, AI 입력(BehaviorBookEntry)에도 미포함.
- 제안: Book Detail 표시 또는 BehaviorBookEntry 확장(§25는 취향 분석 입력으로 규정) 중 택일.

### C. 저위험 정합성 2건
- `dataTransfer.ts` 주석은 "전 테이블"이라 하나 실제로는 `activeSession` 제외 10개 테이블만
  백업(일회성 상태라 의도로 보이나 주석과 불일치 — 주석 수정 필요).
- `removeBookCompletely`가 `activeSession`을 정리하지 않음 — 진행 중 세션의 책을 제거하면
  고아 레코드 가능. 단 활성 세션 중 Book Detail 도달이 사실상 불가하고 read 페이지가
  `setBook(null)`로 방어해 하드 락 없음. 트랜잭션에 activeSession 정리 1줄 추가 여지.

### D. 플랜/스펙 문서 낡음 (기록용)
- `docs/superpowers/plans/2026-08-18-reading-calendar-core-loop.md`: 삭제된
  `getLastSessionForBook`, 폐기된 하단 5탭 TabBar, `greetingForHour` 등 초기 설계 그대로 —
  역사적 스냅샷 문서로 간주(문서 상단에 주의 문구 추가함). 최신 상태는 본 BACKLOG가 기준.
- 스펙 변경 이력의 콘텐츠 폭 서술(768px)은 lg 1024px 확대 이전 세대 — 스펙 12행의
  "BACKLOG가 단일 기준" 위임에 따라 본 문서를 우선한다.
