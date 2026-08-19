# Rive

Rive는 독서 시간과 페이지를 최소한의 입력으로 기록하고, 캘린더·통계·AI 취향 분석으로 이어주는 개인 독서 웹앱입니다.

- 배포: https://rive-ochre.vercel.app
- 로컬 모드: 비로그인 상태에서 IndexedDB(Dexie) 저장
- 계정 모드: Supabase Auth·Postgres·RLS·Realtime 동기화

## 주요 기능

- READ 타이머 → 종료 페이지·메모 저장 → Today/Calendar 반영
- 도서 검색(Kakao → Google Books 폴백) 및 Open Library 메타데이터 보강
- Library 상태·별점·필터, 수동 기록, 노트·인용구, 완독 목표일
- Insights 통계·히트맵·스트릭·리캡
- Gemini 기반 Reading Profile, 실재 도서 후보 추천, 인용구 사진 OCR
- JSON 백업·병합 복원, PWA 홈 화면 설치, 라이트·다크·시스템 테마

## 로컬 실행

Node.js 22 기준입니다.

```bash
npm ci
npm run dev
```

http://localhost:7001 에서 실행됩니다. `.env.local`에 다음 값이 필요합니다.

```dotenv
KAKAO_REST_API_KEY=
GEMINI_API_KEY=
GOOGLE_BOOKS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`GOOGLE_BOOKS_API_KEY`는 선택이며, 없거나 요청이 실패하면 Open Library로 보강합니다.

## 검증

```bash
npm run test
npm run test:coverage
npm run lint
npm run typecheck
npm run build
npm run test:e2e
npm run verify
```

`npm run verify`는 coverage 임계치, ESLint, TypeScript, Next.js production build를 순차 검증합니다. Playwright는 Chromium 데스크톱·모바일에서 실제 독서 저장 루프와 보안 헤더를 검증합니다.

## 데이터베이스와 배포

Supabase 스키마는 [`supabase/migrations`](./supabase/migrations), 운영 순서는 [`docs/DEPLOY.md`](./docs/DEPLOY.md)에 있습니다. `main` push는 연동된 Vercel production 배포를 시작합니다.

신규 독서 세션 RPC migration이 운영 DB에 적용되기 전에도 중복 없이 재시도 가능한 호환 경로가 동작하지만, 완전한 서버 원자성은 `20260819030000_atomic_reading_sessions.sql` 적용 후 활성화됩니다.
