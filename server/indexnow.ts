/**
 * IndexNow API 연동 모듈
 *
 * 글을 발행하는 즉시 Bing·네이버 IndexNow 엔드포인트에 URL을 전송하여
 * 검색엔진이 새 콘텐츠를 빠르게 수집하도록 알립니다.
 *
 * - Bing IndexNow: https://www.bing.com/indexnow
 * - 네이버 IndexNow: https://searchadvisor.naver.com/indexnow
 * - 다음(Kakao)은 자체 IndexNow 엔드포인트 없음 (Bing 파트너 네트워크를 통해 간접 수집)
 *
 * 소유권 확인 키는 DB siteConfig에 저장되며, 없으면 자동 생성합니다.
 * 키 파일 엔드포인트: GET /{key}.txt
 */

import type { Express, Request, Response } from "express";
import { getSiteConfigAll, upsertSiteConfigBulk } from "./db";
import crypto from "crypto";

// IndexNow 엔드포인트 목록
const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://searchadvisor.naver.com/indexnow",
];

/** IndexNow 키 조회 또는 자동 생성 */
async function getOrCreateIndexNowKey(): Promise<string> {
  const config = await getSiteConfigAll();
  if (config.indexNowKey && config.indexNowKey.length >= 8) {
    return config.indexNowKey;
  }
  // 32자 hex 키 자동 생성
  const newKey = crypto.randomBytes(16).toString("hex");
  await upsertSiteConfigBulk({ indexNowKey: newKey });
  return newKey;
}

/**
 * 단일 URL을 IndexNow 엔드포인트에 알림
 * 실패해도 예외를 던지지 않음 (비동기 fire-and-forget)
 */
export async function notifyIndexNow(url: string): Promise<void> {
  try {
    const key = await getOrCreateIndexNowKey();
    const config = await getSiteConfigAll();
    // siteUrl을 그대로 사용 (www 제거하지 않음)
    // Cloudflare 등에서 www가 canonical인 경우 host/keyLocation도 www로 일치시켜야 함
    const rawSiteUrl = (config.siteUrl || "https://vibecraftx.com").replace(/\/$/, "");
    const host = new URL(rawSiteUrl).hostname;

    const body = JSON.stringify({
      host,
      key,
      keyLocation: `${rawSiteUrl}/${key}.txt`,
      urlList: [url],
    });

    const results = await Promise.allSettled(
      INDEXNOW_ENDPOINTS.map(endpoint =>
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          signal: AbortSignal.timeout(8000),
        })
      )
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        console.log(`[IndexNow] ${INDEXNOW_ENDPOINTS[i]} → ${result.value.status}`);
      } else {
        console.warn(`[IndexNow] ${INDEXNOW_ENDPOINTS[i]} 실패:`, result.reason);
      }
    });
  } catch (err) {
    console.warn("[IndexNow] 알림 오류 (무시):", err);
  }
}

/**
 * IndexNow 키 파일 엔드포인트 등록
 * 검색엔진이 GET /{key}.txt 요청으로 사이트 소유권을 확인
 */
export function registerIndexNowKeyRoute(app: Express) {
  // 동적 키 파일 라우트: /[8~64자 hex].txt 패턴 (IndexNow 키 길이 유연 대응)
  app.get(/^\/([a-f0-9]{8,64})\.txt$/, async (req: Request, res: Response) => {
    try {
      const requestedKey = req.params[0];
      const key = await getOrCreateIndexNowKey();
      if (requestedKey !== key) {
        return res.status(404).send("Not Found");
      }
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.status(200).send(key);
    } catch (err) {
      console.error("[IndexNow] 키 파일 오류:", err);
      return res.status(500).send("Internal Server Error");
    }
  });
}
