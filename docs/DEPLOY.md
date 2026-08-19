# Rive 배포 준비 (Vercel Hobby — 무료)

상태: **준비 완료, 실행 대기** (사용자 지시로 배포는 보류, 2026-08-19)
전제: Supabase 전환 1차 완료(스키마·RLS·인증 게이트·이관 E2E 통과).

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
7. 배포 후 확인 체크리스트:
   - [ ] 비로그인: 책 검색·READ·기록(로컬 모드) 동작
   - [ ] 회원가입/로그인 → 서버 모드 전환, 이관 프롬프트
   - [ ] 비로그인 AI 호출이 401 안내로 차단되는지
   - [ ] 라이트/다크 모드, 모바일 뷰포트

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
