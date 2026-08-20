# Rive 작업 인수인계

최종 확인: **2026-08-20 KST**

이 문서는 새 세션에서 가장 먼저 읽는 현재 상태 문서다. 구현 이력과 장기 과제는
[`BACKLOG.md`](./BACKLOG.md), 운영 절차는 [`DEPLOY.md`](./DEPLOY.md), 초기 설계는
`docs/superpowers/` 아래 역사적 문서를 참고한다.

## 1. 지금 상태

| 항목 | 현재 상태 |
|---|---|
| Git 브랜치 | `main`, 문서 작업 시작 시 `origin/main`과 동기화 |
| 최근 기능 커밋 | `2fa5a90` — 독서 기록 정합성과 품질 게이트 강화 |
| 직전 문서 커밋 | `a24e212` — 배포 검증 경계 기록 |
| 운영 URL | https://rive-ochre.vercel.app |
| Vercel | Production deployment `5984060799`, `a24e212`, `success` |
| 로컬 검증 | Vitest 22파일/132건, lint, typecheck, build 통과 |
| E2E | Chromium desktop/mobile 4건 통과 |
| 운영 스모크 | 홈 200, 비로그인 AI 401, 보안 헤더 확인 |
| 운영 Supabase RPC | `save_reading_session` 미등록(`PGRST202`) |
| GitHub Actions | 초안만 `.github/ci.yml`에 보존, workflow로는 비활성 |

문서 갱신 커밋은 위 기준 커밋 다음에 생성된다. 새 세션에서는 다음 명령으로 최신 커밋과
배포를 다시 확인한다.

```bash
git switch main
git pull --ff-only origin main
git log -3 --oneline --decorate
git status -sb
```

## 2. 완료된 핵심 작업

### 독서 기록 정합성

- 저장·수정·삭제와 진행률·완독 상태·활성 타이머 갱신을 repository 원자 연산으로 통합.
- Dexie는 단일 transaction을 사용하고, caller-generated UUID로 응답 유실 후 재시도해도
  동일 세션 한 건으로 수렴한다.
- Supabase용 `save_reading_session`, `update_reading_session`,
  `delete_reading_session` RPC를
  `supabase/migrations/20260819030000_atomic_reading_sessions.sql`에 구현했다.
- RPC는 `(user_id, book_id)`의 `user_books` 행을 `FOR UPDATE`로 잠가 동일 책의 동시
  변경을 직렬화한다.
- 활성 타이머는 저장한 세션과 `bookId`, `startedAt`, `startPage`가 모두 일치할 때만
  삭제하므로 다른 탭에서 새로 시작한 타이머를 보존한다.
- 운영 RPC가 없는 동안 정확한 `PGRST202`에만 호환 경로가 동작한다. 이 경로는 중복은
  방지하지만 여러 REST 요청으로 구성되어 **서버 원자적이지 않다**.

관련 파일:

- `src/lib/repository/types.ts`
- `src/lib/repository/dexieRepository.ts`
- `src/lib/repository/supabaseRepository.ts`
- `src/lib/bookProgress.ts`
- `supabase/migrations/20260819030000_atomic_reading_sessions.sql`

### 데이터 가져오기와 API

- 로컬 JSON import는 필수 필드·범위·enum·FK를 선검증하고 Dexie transaction으로
  처리한다.
- 서버 import는 기존 서버 책 ID를 포함해 참조를 검증하며, 알 수 없는 참조를 조용히
  버리지 않고 RPC 호출 전에 중단한다.
- AI route 네 곳은 runtime schema와 본문 크기를 quota 차감 전에 검사한다.
- 도서 API는 200자 검색 상한, 8초 외부 요청 timeout, CDN cache header를 적용했다.
- `nosniff`, frame deny, referrer, permissions 보안 헤더를 운영에서 확인했다.

### 접근성·성능·테스트

- 모바일 drawer 포커스 이동/트랩/Escape/복귀, 배경 스크롤 잠금과 accessible name,
  live region, alert를 보강했다.
- `prefers-reduced-motion`과 Motion provider를 적용했다.
- 검색 stale-response/abort, BroadcastChannel 정리, 월간 책 batch 조회를 테스트한다.
- coverage-v8, fake-indexeddb, Playwright desktop/mobile 검증을 추가했다.

## 3. 2026-08-20 최신 검증 증거

다음 명령을 문서 갱신 전에 새로 실행했다.

```bash
npm run verify
CI=1 npm run test:e2e
```

결과:

- Vitest: **22 test files, 132 tests passed**
- Coverage: statements **28.55%**, branches **25.45%**, functions **23.08%**,
  lines **28.86%**
- ESLint: 통과
- TypeScript `tsc --noEmit`: 통과
- Next.js 16.3.1 production build: 통과, 정적/동적 route 15개 생성
- Playwright: desktop/mobile 합계 **4 passed (15.6s)**
- 운영 홈: HTTP 200
- 운영 AI profile 비로그인 호출: HTTP 401
- 운영 헤더: `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` 확인

## 4. 다음 세션 최우선 1 — 운영 Supabase migration

### 현재 확인된 사실

`20260819030000_atomic_reading_sessions.sql`은 코드와 로컬 PostgreSQL 17에서는 검증됐지만
운영 PostgREST schema cache에는 없다. 2026-08-20에 **실제 필수 인자 전체를 포함한** 다음
형태로 호출해 `PGRST202`를 재확인했다.

```json
{
  "p_session": {
    "id": "00000000-0000-4000-8000-000000000001",
    "bookId": "00000000-0000-4000-8000-000000000002",
    "startedAt": 1,
    "endedAt": 2,
    "durationSeconds": 1,
    "startPage": 0,
    "endPage": 1,
    "pagesRead": 1,
    "createdAt": 2
  },
  "p_progress_mode": "always",
  "p_mark_as_read": false,
  "p_clear_active": false
}
```

즉, 빈 인자 호출 때문에 생긴 오판이 아니라 함수 자체가 운영에 미등록된 상태다.

### 필요한 외부 권한

다음 중 하나가 필요하다.

- Supabase dashboard SQL Editor 로그인 권한
- 또는 DB password가 포함된 `psql` 접속 권한

Vercel 배포는 DB migration을 자동 적용하지 않는다. anon key나 service-role key만으로 DDL을
실행할 수 없으므로, 해당 자격 증명 없이 에이전트가 더 진행할 수 없다.

### 적용 순서

1. 운영 프로젝트가 `brsjafeidrsouqbwiyef`인지 다시 확인한다.
2. `supabase/migrations/20260819030000_atomic_reading_sessions.sql` 전체를 SQL Editor에서
   실행하거나, password를 URL에 직접 남기지 않는 방식으로 `psql -v ON_ERROR_STOP=1 -f`를
   실행한다.
3. PostgREST가 schema를 다시 읽은 뒤 위 전체 인자 RPC probe를 반복한다.
4. 비로그인 anon probe의 기대값은 더 이상 `PGRST202`가 아니며, 함수 내부의
   `authentication required` 오류여야 한다.
5. 로그인 테스트 계정으로 save 재시도, update, delete, 새 active timer 보존을 실제 운영
   데이터에서 확인한다. 테스트 데이터는 확인 후 정리한다.
6. 위 검증이 끝나기 전에는 `supabaseRepository.ts`의 `PGRST202` 호환 경로를 제거하지
   않는다.
7. 검증 완료 후에만 호환 경로와 그 전용 테스트를 제거하는 별도 커밋을 만든다.

### 로컬 SQL 검증에서 이미 확인한 것

- migration 적용 성공
- 같은 session ID 두 번 저장 시 session 한 건
- update/delete 후 progress 재계산
- 잘못된 페이지·시간 범위 거부
- 같은 책 동시 mutation이 row lock을 기다린 뒤 실행
- 이전 세션 저장 시 새 active timer 보존, 일치 세션 저장 시 timer 삭제

## 5. 다음 세션 최우선 2 — GitHub Actions 활성화

### 현재 확인된 권한 상태

- `sknskin`: `sknskin/Rive` push 가능, OAuth scopes는 `repo` 등이며 `workflow` 없음.
- `dev-virgo`: OAuth `workflow` scope는 있으나 `sknskin/Rive` 권한은 pull-only.
- 따라서 `dev-virgo`로 전환해도 해결되지 않는다.
- `.github/workflows/ci.yml` push는 다음 오류로 거부됐다.

```text
refusing to allow an OAuth App to create or update workflow
without `workflow` scope
```

실행 가능한 workflow 내용은 `.github/ci.yml`에 그대로 보존돼 있지만 GitHub Actions가
읽는 경로가 아니므로 현재 자동 CI는 **비활성**이다.

### 활성화 순서

이 단계는 GitHub OAuth 브라우저 승인이 필요하다.

```bash
gh auth switch -u sknskin
gh auth refresh -h github.com -s workflow
gh auth status
mkdir -p .github/workflows
git mv .github/ci.yml .github/workflows/ci.yml
npm run verify
CI=1 npm run test:e2e
git add .github/workflows/ci.yml
git commit -m "ci: activate automated quality gate"
git push origin main
gh run list --branch main --limit 5
```

`gh auth status`에서 활성 계정이 `sknskin`이고 scope에 `workflow`가 보일 때만 push한다.
push 후 Actions의 `CI`가 test coverage, lint, typecheck, build, Playwright를 모두 통과하는지
확인한다.

## 6. 나머지 잔여 과제

다음은 오류 수정이 아니라 외부 권한 또는 제품 결정을 요구한다. 임의로 범위를 넓히지
말고 사용자가 해당 기능을 지시한 경우 진행한다.

| 우선순위 | 과제 | 선행 조건 |
|---|---|---|
| P1 | AI 실패 시 quota 환불 | service-role 보호 설계·운영 secret |
| P1 | Vercel WAF/platform rate limit | 실제 남용 지표 또는 운영 정책 |
| P1 | 계정 삭제·비밀번호 재설정·개인정보 문구 | 제품·법무 정책 |
| P2 | Kakao OAuth | Kakao 개발자 콘솔 설정 |
| P2 | 바코드 스캔 실기기 검증 | 지원 Android 기기·카메라 권한 |
| P2 | 독서 리마인더/Web Push | 알림 UX·권한 정책·service worker |
| 장기 | 재독 주기, 북클럽, 버디 리드, 공유 카탈로그 | 별도 제품 설계 |
| 장기 | Advanced Insights | 지표 정의와 화면 설계 |

## 7. 새 세션 시작 체크리스트

```bash
cd /Users/dohee/Documents/workspace/project/Rive
git switch main
git pull --ff-only origin main
git status -sb
npm ci
npm run verify
CI=1 npm run test:e2e
```

그 다음 순서:

1. `docs/HANDOFF.md`의 운영 Supabase와 GitHub Actions 상태를 읽는다.
2. 해당 자격 증명이 생겼는지 읽기 전용으로 확인한다.
3. 권한이 없다면 같은 실패를 반복하지 말고 다른 독립 과제만 진행한다.
4. 변경 후 targeted test → `npm run verify` → E2E 순서로 검증한다.
5. `main` push 후 Vercel deployment가 새 SHA로 `success`인지 확인한다.
6. 운영 홈/API 스모크를 수행하고 이 문서와 `BACKLOG.md`, `DEPLOY.md`를 다시 갱신한다.

## 8. 다음 세션에서 잘못 주장하면 안 되는 것

- 운영 서버 세션 저장이 이미 완전 원자적이라는 주장: **아님**. migration 미적용.
- GitHub Actions CI가 자동 실행된다는 주장: **아님**. workflow 경로 미등록.
- 빈 인자 RPC probe만으로 함수 존재를 판정: 금지. 전체 parameter name을 사용한다.
- `PGRST202` 호환 경로를 migration 검증 전에 제거: 금지.
- `dev-virgo` 계정으로 workflow를 push할 수 있다는 가정: 확인 결과 push 권한 없음.
- 과거 설계/계획 문서의 체크박스를 현행 잔여로 해석: 금지. 현재 기준은 이 문서와
  `BACKLOG.md` 최하단 최신 섹션이다.
