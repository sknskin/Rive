# Rive 백로그

최종 갱신: 2026-08-18
근거: 코드베이스 전수조사(라우트/컴포넌트/데이터 모델/하이진 스캔) + 제품 스펙 대조.
모든 항목은 코드에서 확인된 사실 기반이며, 항목마다 스펙 참조(§)와 근거를 병기한다.

## 현재 상태 요약

- 구현 완료: 핵심 루프(READ→스톱워치→저장→Today/Calendar), 도서 검색(Kakao+Google 폴백),
  Library/Book Detail(상태·별점·DNF 사유·타임라인), 수동 기록, Insights(기간·속도·시간대·요일),
  AI 취향 분석 온보딩 + Reading Profile + For You 추천/피드백(Gemini 실호출 검증 완료), 테마 3모드.
- 페이지 7개, API 라우트 3개, 컴포넌트 22개. 단위 테스트 39개 통과.
- 코드 하이진: TODO/FIXME/`any`/빈 catch/ts-ignore 0건 (전수조사 확인).
- 환경: dev/start 포트 7001 (7000은 macOS AirPlay가 점유). `.env.local`에
  KAKAO_REST_API_KEY, GEMINI_API_KEY 설정 완료. AI 모델: gemini-3.6-flash
  (신규 키에서 2.5-flash 사용 불가 확인).

---

## P1 — 다음 착수 권장

### 1. 도서 메타데이터 보강 (여러 한계의 공통 원인)
- 사실: Kakao 매퍼가 `pageCount: 0` 하드코딩(`src/lib/bookSearch/kakao.ts:25`) — Kakao API가
  페이지 수를 제공하지 않음. Kakao 키가 있으면 항상 Kakao 우선이므로 사실상 모든 책이
  pageCount 0으로 등록됨.
- 사실: `Book` 타입에 `description`, `categories`(장르), `subtitle`, `publishedDate`,
  `language`, `isbn10` 필드 없음 (스펙 §72에는 존재).
- 파생 한계: 진행률 %·완독 토글이 비활성(pageCount 0), 장르 분석(§33) 불가,
  Book Detail에 책 소개(§22) 없음.
- 제안: 책 등록 시 ISBN으로 Google Books를 병행 조회해 pageCount/categories/description 병합.

### 2. Insights 장르 분석 (§33, §80)
- 사실: 책 단위 장르 데이터가 수집되지 않아 미구현. 위 1번에 종속.
  (참고: 온보딩 선호 장르와 AI 프로필 장르 점수는 이미 저장·표시됨 — 실제 독서 기록
  기반 장르 분포가 없는 것.)

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
| Heatmap | §30 | Insights에 없음 (기간 타일·속도·시간대·요일 4개 섹션뿐) |
| 과거의 오늘 | §28 | 미구현 |
| 예상 완독일 | §35 | 미구현 (Reading Speed는 있음 → 조합 가능) |
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
| Haptic Feedback | §0-6 | 미적용 |

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
