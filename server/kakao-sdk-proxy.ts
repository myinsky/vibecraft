/**
 * 카카오 SDK 프록시 엔드포인트
 * 
 * 카카오 CDN의 캐시 TTL(2시간)을 우회하여 서버에서 1일 캐시로 제공합니다.
 * PageSpeed Insights "효율적인 캐시 수명" 경고 해결용.
 * 
 * 엔드포인트: GET /api/kakao-sdk
 * → t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js 를 프록시하여
 *   Cache-Control: public, max-age=86400 (1일) 헤더로 응답
 */
import type { Express } from "express";
import https from "https";

const KAKAO_SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
const CACHE_DURATION = 86400; // 1일 (초)

// 메모리 캐시 (서버 재시작 전까지 유지)
let cachedSdk: { content: string; etag: string; fetchedAt: number } | null = null;

function fetchKakaoSdk(): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(KAKAO_SDK_URL, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export function registerKakaoSdkProxy(app: Express) {
  app.get("/api/kakao-sdk", async (_req, res) => {
    try {
      const now = Date.now();
      // 메모리 캐시가 유효하면 바로 반환 (1일 이내)
      if (cachedSdk && now - cachedSdk.fetchedAt < CACHE_DURATION * 1000) {
        res.set({
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": `public, max-age=${CACHE_DURATION}, stale-while-revalidate=3600`,
          "ETag": cachedSdk.etag,
        });
        return res.send(cachedSdk.content);
      }
      // 카카오 CDN에서 SDK 다운로드
      const content = await fetchKakaoSdk();
      const etag = `"kakao-sdk-${Date.now()}"`;
      cachedSdk = { content, etag, fetchedAt: now };
      res.set({
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_DURATION}, stale-while-revalidate=3600`,
        "ETag": etag,
      });
      res.send(content);
    } catch (err) {
      // 프록시 실패 시 카카오 CDN으로 리다이렉트
      res.redirect(302, KAKAO_SDK_URL);
    }
  });
}
