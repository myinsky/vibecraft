/**
 * 쿠팡 파트너스 API 모듈
 *
 * - HMAC-SHA256 서명 인증
 * - 키워드 기반 상품 검색
 * - DB 캐싱 (6시간 TTL)
 * - 개발자 장비 카테고리 전용 키워드 매핑
 */

import crypto from "crypto";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface CoupangProduct {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;         // 파트너스 트래킹 URL
  categoryName: string;
  rating?: number;
  reviewCount?: number;
}

export interface CoupangSearchResult {
  keyword: string;
  products: CoupangProduct[];
  cachedAt: number;           // Unix ms
}

// ─── 개발자 장비 기본 키워드 매핑 ───────────────────────────────────────────

export const DEFAULT_DEV_KEYWORDS: Record<string, string[]> = {
  "노트북": ["개발자 노트북", "맥북", "고성능 노트북"],
  "모니터": ["듀얼 모니터", "4K 모니터", "개발자 모니터"],
  "키보드": ["기계식 키보드", "무선 키보드", "개발자 키보드"],
  "마우스": ["무선 마우스", "인체공학 마우스"],
  "헤드셋": ["노이즈캔슬링 헤드셋", "개발자 헤드폰"],
  "웹캠": ["화상회의 웹캠", "고화질 웹캠"],
};

// ─── HMAC-SHA256 서명 생성 ───────────────────────────────────────────────────

function generateHmacSignature(
  secretKey: string,
  method: string,
  url: string,
  datetime: string,
): string {
  // 공식 Java 예제 기준: message = datetime + method + path + query
  // path와 query 사이에 '?'가 없음 (urlObj.search에는 '?'가 포함되므로 직접 분리)
  const urlObj = new URL(url);
  const path = urlObj.pathname;
  const query = urlObj.search ? urlObj.search.slice(1) : ""; // '?' 제거
  const message = datetime + method + path + query;
  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("hex");
}

function buildAuthHeader(
  accessKey: string,
  secretKey: string,
  method: string,
  url: string,
): string {
  // 쿠팡 파트너스 공식 문서 형식: yyMMddTHHmmssZ (2자리 연도, UTC)
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const HH = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${yy}${MM}${dd}T${HH}${mm}${ss}Z`;
  const signature = generateHmacSignature(secretKey, method, url, datetime);
  // 공식 문서 형식: 쉼표 사이 공백 없음 (CEA algorithm=HmacSHA256,access-key=...,signed-date=...,signature=...)
  return `CEA algorithm=HmacSHA256,access-key=${accessKey},signed-date=${datetime},signature=${signature}`;
}

// ─── 쿠팡 파트너스 API 호출 ──────────────────────────────────────────────────

const COUPANG_API_BASE = "https://api-gateway.coupang.com";

/**
 * 키워드로 쿠팡 상품 검색
 */
export async function searchCoupangProducts(
  accessKey: string,
  secretKey: string,
  keyword: string,
  limit = 3,
): Promise<CoupangProduct[]> {
  const path = `/v2/providers/affiliate_open_api/apis/openapi/products/search`;
  const params = new URLSearchParams({
    keyword,
    limit: String(limit),
    subId: "wordcracker-blog",
  });
  const url = `${COUPANG_API_BASE}${path}?${params.toString()}`;

  const authHeader = buildAuthHeader(accessKey, secretKey, "GET", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json;charset=UTF-8",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`쿠팡 API 오류 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    rCode: string;
    rMessage: string;
    data?: {
      productData?: Array<{
        productId: number;
        productName: string;
        productPrice: number;
        productImage: string;
        productUrl: string;
        categoryName: string;
        rating?: number;
        reviewCount?: number;
      }>;
    };
  };

  if (data.rCode !== "0") {
    throw new Error(`쿠팡 API 응답 오류: ${data.rMessage}`);
  }

  return (data.data?.productData ?? []).map((p) => ({
    productId: p.productId,
    productName: p.productName,
    productPrice: p.productPrice,
    productImage: p.productImage,
    productUrl: p.productUrl,
    categoryName: p.categoryName,
    rating: p.rating,
    reviewCount: p.reviewCount,
  }));
}

/**
 * API 연결 테스트 (간단한 키워드 1개 검색)
 */
export async function testCoupangApiConnection(
  accessKey: string,
  secretKey: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const products = await searchCoupangProducts(accessKey, secretKey, "노트북", 1);
    return {
      success: true,
      message: `연결 성공 — 테스트 상품 ${products.length}개 조회됨`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "알 수 없는 오류",
    };
  }
}

// ─── 캐시 헬퍼 (DB 기반, 동적 TTL) ─────────────────────────────────────────

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 기본 6시간

export async function getCachedProducts(
  keyword: string,
  cacheTtlMs?: number,
): Promise<CoupangProduct[] | null> {
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return null;
    const { coupangProductCache } = await import("../drizzle/schema");
    const { eq, gt } = await import("drizzle-orm");

    const rows = await db
      .select()
      .from(coupangProductCache)
      .where(
        eq(coupangProductCache.keyword, keyword),
      )
      .limit(1);

    if (!rows.length) return null;
    const row = rows[0];

    // TTL 체크 (siteConfig에서 설정한 주기 우선, 없으면 기본 6시간)
    if (Date.now() - row.cachedAt > (cacheTtlMs ?? DEFAULT_CACHE_TTL_MS)) return null;

    return JSON.parse(row.products) as CoupangProduct[];
  } catch {
    return null;
  }
}

export async function setCachedProducts(
  keyword: string,
  products: CoupangProduct[],
): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return;
    const { coupangProductCache } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    // upsert
    const existing = await db
      .select({ id: coupangProductCache.id })
      .from(coupangProductCache)
      .where(eq(coupangProductCache.keyword, keyword))
      .limit(1);

    if (existing.length) {
      await db
        .update(coupangProductCache)
        .set({ products: JSON.stringify(products), cachedAt: Date.now() })
        .where(eq(coupangProductCache.id, existing[0].id));
    } else {
      await db.insert(coupangProductCache).values({
        keyword,
        products: JSON.stringify(products),
        cachedAt: Date.now(),
      });
    }
  } catch {
    // 캐시 실패는 무시 (API 직접 호출로 폴백)
  }
}

/** 쿠팡 상품 캐시 전체 삭제 (관리자 전용) */
export async function clearAllCoupangCaches(): Promise<{ deletedCount: number }> {
  try {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return { deletedCount: 0 };
    const { coupangProductCache } = await import("../drizzle/schema");
    const result = await db.delete(coupangProductCache);
    return { deletedCount: (result as any).affectedRows ?? 0 };
  } catch {
    return { deletedCount: 0 };
  }
}
