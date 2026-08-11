# 워드크래커 블로그 (Wordcracker Blog)

한국어 AI/바이브코딩 블로그 웹앱. React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL 스택으로 구축되었습니다.

## 주요 기능

- **블로그 콘텐츠 관리**: 마크다운 기반 글 작성 및 편집
- **카테고리 관리**: 동적 네비게이션 및 카테고리별 글 목록
- **사용자 인증**: Manus OAuth 통합
- **관리자 대시보드**: 글, 네비게이션, 설정 관리
- **vibecraftx.com 통합**: 외부 블로그 글 목록 표시
- **이미지 최적화**: 프록시 기반 CORS 해결 및 캐싱
- **반응형 디자인**: 모바일/태블릿/데스크톱 지원

## 기술 스택

| 계층 | 기술 |
|------|------|
| **프론트엔드** | React 19, Tailwind CSS 4, Wouter (라우팅) |
| **백엔드** | Express 4, tRPC 11, Node.js |
| **데이터베이스** | MySQL 8.0+ / TiDB |
| **ORM** | Drizzle ORM |
| **빌드 도구** | Vite, esbuild |
| **테스트** | Vitest |
| **패키지 관리자** | pnpm |

## 설치 및 실행

### 사전 요구사항

- Node.js 18.0 이상
- pnpm 8.0 이상
- MySQL 8.0 이상 또는 TiDB
- Git

### 1단계: 저장소 클론 및 의존성 설치

```bash
# 저장소 클론
git clone <repository-url>
cd wordcracker-blog

# 의존성 설치
pnpm install
```

### 2단계: 환경변수 설정

```bash
# .env.example을 복사하여 .env.local 생성
cp .env.example .env.local

# .env.local 파일을 열어 실제 값으로 변경
# 필수 항목:
# - DATABASE_URL: MySQL 연결 문자열
# - JWT_SECRET: 임의의 긴 문자열 (최소 32자)
# - VITE_APP_ID: Manus OAuth 앱 ID
# - BUILT_IN_FORGE_API_KEY: API 키
```

### 3단계: 데이터베이스 마이그레이션

```bash
# 데이터베이스 스키마 생성 및 마이그레이션
pnpm db:push
```

### 4단계: 개발 서버 실행

```bash
# 개발 서버 시작 (Vite + Express)
pnpm dev

# 브라우저에서 http://localhost:3000 접속
```

## 프로덕션 배포

### 빌드

```bash
# 프로덕션 빌드
pnpm build

# 빌드 결과:
# - dist/: 프론트엔드 정적 파일
# - dist/server.js: 백엔드 번들
```

### 배포 옵션

#### 옵션 1: Docker (권장)

```dockerfile
# Dockerfile 예시
FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod

COPY dist ./dist
COPY drizzle ./drizzle

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```bash
# 빌드 및 실행
docker build -t wordcracker-blog .
docker run -p 3000:3000 \
  -e DATABASE_URL="mysql://user:pass@host:3306/db" \
  -e JWT_SECRET="your-secret" \
  wordcracker-blog
```

#### 옵션 2: Node.js 직접 실행

```bash
# 환경변수 설정
export DATABASE_URL="mysql://user:pass@host:3306/db"
export JWT_SECRET="your-secret"
export NODE_ENV=production

# 서버 실행
node dist/server.js
```

#### 옵션 3: PM2 (프로세스 관리자)

```bash
# PM2 설치
npm install -g pm2

# 앱 시작
pm2 start dist/server.js --name "wordcracker-blog"

# 자동 재시작 설정
pm2 startup
pm2 save
```

#### 옵션 4: 클라우드 플랫폼

**Vercel/Netlify**: 정적 프론트엔드만 배포 가능 (백엔드 필요)

**Railway/Render/Heroku**:
```bash
# 저장소 연결 후 자동 배포
# 환경변수 설정: DATABASE_URL, JWT_SECRET 등
```

**AWS/GCP/Azure**: 컨테이너 또는 VM 배포

## 프로젝트 구조

```
wordcracker-blog/
├── client/                    # 프론트엔드 (React)
│   ├── src/
│   │   ├── pages/            # 페이지 컴포넌트
│   │   ├── components/       # 재사용 컴포넌트
│   │   ├── hooks/            # 커스텀 훅
│   │   ├── lib/              # 유틸리티 함수
│   │   ├── contexts/         # React Context
│   │   ├── App.tsx           # 라우트 정의
│   │   ├── main.tsx          # 진입점
│   │   └── index.css         # 전역 스타일
│   └── public/               # 정적 파일
│
├── server/                    # 백엔드 (Express + tRPC)
│   ├── routers.ts            # tRPC 프로시저 정의
│   ├── db.ts                 # 데이터베이스 쿼리 헬퍼
│   ├── auth.logout.test.ts   # 테스트 예시
│   └── _core/                # 프레임워크 코어
│       ├── index.ts          # Express 앱 설정
│       ├── context.ts        # tRPC 컨텍스트
│       ├── oauth.ts          # OAuth 처리
│       ├── llm.ts            # LLM 통합
│       └── ...
│
├── drizzle/                   # 데이터베이스 스키마
│   ├── schema.ts             # 테이블 정의
│   ├── relations.ts          # 관계 정의
│   └── migrations/           # 마이그레이션 파일
│
├── shared/                    # 공유 타입 및 상수
│   ├── types.ts
│   └── const.ts
│
├── package.json              # 의존성 정의
├── tsconfig.json             # TypeScript 설정
├── vite.config.ts            # Vite 설정
├── drizzle.config.ts         # Drizzle 설정
├── vitest.config.ts          # Vitest 설정
└── .env.example              # 환경변수 템플릿
```

## 개발 가이드

### 새 페이지 추가

```typescript
// client/src/pages/NewPage.tsx
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function NewPage() {
  const { user } = useAuth();
  const { data, isLoading } = trpc.feature.useQuery();

  return (
    <div>
      {/* 페이지 콘텐츠 */}
    </div>
  );
}
```

### 새 API 엔드포인트 추가

```typescript
// server/routers.ts
export const appRouter = router({
  feature: router({
    list: publicProcedure
      .input(z.object({ limit: z.number() }))
      .query(async ({ input }) => {
        return await db.query.posts.findMany({ limit: input.limit });
      }),

    create: protectedProcedure
      .input(z.object({ title: z.string() }))
      .mutation(async ({ input, ctx }) => {
        return await db.insert(posts).values({
          title: input.title,
          authorId: ctx.user.id,
        });
      }),
  }),
});
```

### 데이터베이스 스키마 수정

```typescript
// drizzle/schema.ts
export const posts = mysqlTable("posts", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  // ... 다른 필드
});

// 마이그레이션 실행
// pnpm db:push
```

### 테스트 작성

```typescript
// server/feature.test.ts
import { describe, it, expect } from "vitest";

describe("Feature", () => {
  it("should work", () => {
    expect(true).toBe(true);
  });
});

// 테스트 실행: pnpm test
```

## 환경변수 상세 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | ✅ | MySQL 연결 문자열 |
| `JWT_SECRET` | ✅ | 세션 토큰 서명 키 |
| `VITE_APP_ID` | ✅ | Manus OAuth 앱 ID |
| `OAUTH_SERVER_URL` | ✅ | OAuth 서버 URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | API 인증 키 |
| `GEMINI_API_KEY` | ❌ | Google Gemini (AI 기능) |
| `GOOGLE_API_KEY` | ❌ | Google Maps 등 |
| `VITE_KAKAO_JS_KEY` | ❌ | Kakao 지도/로그인 |

## 문제 해결

### 데이터베이스 연결 실패

```bash
# 연결 문자열 확인
# mysql://사용자명:비밀번호@호스트:포트/데이터베이스명

# MySQL 서버 상태 확인
mysql -u user -p -h host -e "SELECT 1"
```

### 포트 이미 사용 중

```bash
# 다른 포트 사용
PORT=3001 pnpm dev

# 또는 기존 프로세스 종료
lsof -i :3000
kill -9 <PID>
```

### 빌드 실패

```bash
# 캐시 초기화
rm -rf node_modules dist
pnpm install
pnpm build
```

## 성능 최적화

- **이미지 최적화**: 프록시 기반 CORS 해결 및 24시간 캐싱
- **코드 분할**: Vite 기반 동적 import
- **데이터베이스**: 인덱스 및 쿼리 최적화
- **캐싱**: tRPC 쿼리 캐싱 및 메모리 캐시

## 보안 고려사항

- 모든 환경변수는 `.env.local`에 저장 (버전 관리 제외)
- 프로덕션에서는 HTTPS 필수
- CORS 설정 검토
- SQL 인젝션 방지 (Drizzle ORM 사용)
- XSS 방지 (React 기본 제공)
- CSRF 토큰 (필요시 추가)

## 라이선스

MIT

## 지원

문제 발생 시 GitHub Issues에 보고해주세요.

---

**최종 업데이트**: 2026년 8월 11일
