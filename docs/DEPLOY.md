# Rive 배포 준비 (Vercel Hobby — 무료)

상태: **운영 배포 (2026-08-19)** — https://rive-ochre.vercel.app (Vercel Hobby,
워크스페이스 sknskin-7775). `main` push 시 Vercel production이 자동 재배포된다.

사전 검증: `npm run verify` + `CI=1 npm run test:e2e`. DB migration은 Vercel이 적용하지
않으므로 배포와 별도로 실행한다.

## 현재 DB migration

다음 순서로 `supabase/migrations` SQL을 적용한다.

1. `20260819000000_init.sql`
2. `20260819010000_realtime_quota.sql`
3. `20260819020000_atomic_import.sql`
4. `20260819030000_atomic_reading_sessions.sql`

마지막 migration은 세션 저장·수정·삭제와 책 진행률·활성 타이머를 한 transaction으로
묶고, 동일 책 변경을 row lock으로 직렬화한다. PostgreSQL 17에서 멱등 재시도,
수정·삭제 재계산, 잠금 대기, 새 활성 타이머 보존을 검증했다.

운영 DB에 4번이 아직 없으면 앱은 `PGRST202`에만 재시도 수렴형 호환 경로를
사용하고 경고를 남긴다. 이 경로는 중복을 막지만 여러 REST 요청이므로 서버 원자적이지
않다. 운영에서 4번을 적용·확인한 후 호환 경로 제거를 별도 commit으로 진행한다.

## 배포 절차 (실행 시)

1. https://vercel.com 접속 → **GitHub로 로그인 (sknskin 계정)**
2. **Add New → Project** → `sknskin/Rive` 리포 Import
   - Framework: Next.js 자동 감지, 빌드 설정 기본값 그대로 (별도 설정 파일 불필요)
3. **Environment Variables**에 아래 4개(+선택 1개) 등록 — 값은 로컬 `.env.local`과 동일:

   | 이름 | 용도 |
   |---|---|
   | `KAKAO_REST_API_KEY` | 도서 검색 (서버 전용) |
   | `GEMINI_API_KEY` | AI 분석/추천/요약 (서버 전용) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (클라이언트 노출 전제) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable 키 (클라이언트 노출 전제, RLS가 보호) |
   | `GOOGLE_BOOKS_API_KEY` (선택) | 현재 키는 제한으로 403 — Open Library 폴백이 대신 동작 |

4. **Deploy** → 완료 후 `https://<project>.vercel.app` 확인
5. Supabase 대시보드 → **Authentication → URL Configuration**에서
   Site URL을 배포 도메인으로 변경하고, **Redirect URLs에 배포 도메인과
   `http://localhost:7001` 둘 다 추가** (Google OAuth 복귀용)
6. Google 로그인을 쓰려면 Google Cloud Console의 OAuth 클라이언트
   **승인된 리디렉션 URI**에 `https://brsjafeidrsouqbwiyef.supabase.co/auth/v1/callback`이
   등록돼 있어야 함 (로컬/배포 공통 — Supabase가 중간 콜백을 받음)
7. GitHub Actions `CI` 성공과 Vercel deployment `success`를 확인
8. 배포 후 확인 체크리스트:
   - [ ] 비로그인: 책 검색·READ·기록(로컬 모드) 동작
   - [ ] 회원가입/로그인 → 서버 모드 전환, 이관 프롬프트
   - [ ] 비로그인 AI 호출이 401 안내로 차단되는지
   - [ ] 라이트/다크 모드, 모바일 뷰포트
   - [ ] 보안 헤더(`nosniff`, `DENY`, Referrer/Permissions Policy)
   - [ ] 도서 검색 API의 CDN cache header

## 주의사항

- **Vercel Hobby는 개인·비상업 용도 한정** — 수익화 시 Pro 필요.
- **Supabase Free는 7일 무요청 시 프로젝트 일시정지** — 주기적 사용 또는 접속 전
  대시보드에서 Restore. 데이터는 유지됨.
- AI 추천 라우트는 실측 약 40초 — Vercel 기본 함수 타임아웃(300초) 내로 문제 없음.
- 배포 시점에 워킹 트리가 커밋·푸시돼 있어야 함 (Vercel은 GitHub 리포 기준 빌드).
- rate limit은 인증 게이트만으로 1차 방어 — 남용 관측 시 Vercel WAF/Upstash 검토(후속).

## 참고

- 인증: 이메일+비밀번호, Confirm email **꺼짐** (2026-08-19 사용자 설정).
- E2E 테스트 계정: `ehgml4523+e2etest@gmail.com` (개발용 — 대시보드
  Authentication → Users에서 삭제해도 무방).
- DB 접속(마이그레이션): psql + 세션 풀러
  `aws-0-ap-northeast-2.pooler.supabase.com:5432`, user `postgres.brsjafeidrsouqbwiyef`.
