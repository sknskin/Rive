# AI Personal Reading Calendar — 1차 작업 설계: 핵심 루프 + 도서 검색

날짜: 2026-08-18
상태: 승인됨 (도희)

> **변경 이력 (2026-08-18, 사용자 지시)**
> - 내비게이션: 본 문서의 "하단 네비게이션(5탭)" 전제는 이후 변경됨 —
>   모바일은 최상단 좌측 햄버거 + 좌측 드로어(최하단 테마 아이콘),
>   데스크톱/태블릿은 상단 바(우측 끝 테마 아이콘). Reading Mode에서는 숨김 유지.
> - 시트: 모바일은 바텀 시트, 데스크톱/태블릿은 중앙 다이얼로그로 반응형 분기.
> - 콘텐츠 폭: 512(모바일)/672(태블릿)/768px(데스크톱) 반응형.
>   → 2026-08-19 재변경: 데스크톱은 lg 1024px로 확대, lg↑에서 화면별 2단 레이아웃 적용.
> - 최신 잔여 과제는 `docs/BACKLOG.md`가 단일 기준.

## 목표

READ → 기록 → Calendar로 이어지는 앱의 핵심 가치를 끝까지 관통하는 수직 슬라이스를 구현한다.
Apple 기본 앱 수준의 절제된 UI/UX를 기본 전제로 한다 (AGENTS 스펙 §0 참조).

## 범위 (1차)

포함:
- 홈(Today) 화면: Currently Reading, READ 히어로 버튼, 오늘의 독서 기록/요약, Empty State
- READ Bottom Sheet: Continue Reading / 다른 Reading 책 / 새로운 책 찾기
- 도서 검색 (Kakao 우선, Google Books 폴백) 및 선택 즉시 읽기 시작
- Reading Mode: 스톱워치, STOP, 종료 페이지 입력 Sheet, 자동 계산 저장
- Calendar: 월간 그리드 + 날짜 선택 시 세션 상세
- 하단 네비게이션 (Today/Calendar 활성, 나머지 3탭은 준비 중)

제외 (다음 단계):
- Library 관리 화면, Insights, AI 취향 분석/추천, 인증, Supabase 연동
- Notes/Quotes, 목표, Heatmap, 수동 세션 입력

## 아키텍처 결정

1. **로컬 우선**: 모든 사용자 데이터는 브라우저 IndexedDB(Dexie)에 저장.
   화면은 클라이언트 컴포넌트 중심.
2. **Repository 추상화**: `src/lib/repository/`에 저장소 인터페이스 정의,
   Dexie 구현체를 기본 주입. 이후 Supabase 전환 시 이 경계만 교체한다.
3. **서버 코드는 도서 검색 Route Handler 하나**: `/api/books/search`.
   Kakao REST API 키를 서버에만 보관. 키 존재 시 Kakao 우선, 없거나 실패 시 Google Books 폴백.

## 의존성 (승인됨)

- `tailwindcss` v4 — 디자인 시스템/토큰
- `dexie` — IndexedDB 래퍼
- `motion` — Sheet/화면 전환 애니메이션

## 데이터 모델 (스펙 §72–74 축소판)

- `books`: id, title, authors[], publisher, isbn13, coverUrl, pageCount, kakaoUrl, googleBooksId, createdAt
- `userBooks`: bookId, status(reading|want|read|paused|dnf), currentPage, startedAt, finishedAt, createdAt
- `readingSessions`: id, bookId, startedAt, endedAt, durationSeconds, startPage, endPage, pagesRead, memo, createdAt
- `activeSession`: 진행 중 세션 1건 (bookId, startedAt, startPage) — 새로고침/재방문 시 스톱워치 복구용

## 화면/흐름

- `/` Today: 인사말 → Currently Reading → READ → 오늘 기록 목록 + 요약(시간/페이지/권수)
- READ Sheet 우선순위: Continue Reading(최근) → 다른 Reading 책 → 새로운 책 찾기
- 시작 페이지: 지난 세션 end_page 자동, `수정` 가능. 새 책은 p.1 제안
- `/read` Reading Mode: 제목 + 시작 페이지 + 대형 스톱워치(히어로) + STOP만 표시, 네비 숨김
- STOP → Sheet: 소요 시간/시작 페이지 요약 + 종료 페이지 입력(필수) + 메모(선택) → 저장
- 저장 → Today로 부드럽게 전환, 새 기록이 즉시 반영
- `/calendar`: 월간 그리드(작은 표지/시간/페이지 요약, 복수 세션은 개수+합계) → 날짜 선택 시 상세

## 디자인 시스템

- Tailwind v4 토큰, Neutral 기반, 라이트/다크 자동 (prefers-color-scheme)
- 시스템 폰트 스택 (SF 계열), 스톱워치는 tabular-nums 대형 타이포
- Card 남용 금지 — 여백과 타이포로 위계 구성 (스펙 §0-9)
- motion으로 Sheet 등장/퇴장과 상태 전환을 연결된 인터랙션으로 표현

## 에러 처리

- 검색: Kakao 실패 → Google 폴백 → 모두 실패 시 재시도 안내 메시지
- 표지 없음 → 타이포 기반 Placeholder 커버
- 스톱워치는 startedAt 기준 경과시간 계산 (백그라운드 탭에서도 정확)
- activeSession으로 새로고침 후 Reading Mode 복구
- 저장 실패 시 입력값 유지 + 에러 표시. 빈 catch 금지

## 성공 기준

- 앱 실행 → READ → 책 선택(또는 검색) → STOP → 종료 페이지 입력 → 저장까지
  설명 없이 자연스럽게 완료 가능 (스펙 §83–85)
- 저장된 세션이 Today와 Calendar에 즉시 반영
- Kakao 키가 없어도 Google Books로 전체 흐름 동작
