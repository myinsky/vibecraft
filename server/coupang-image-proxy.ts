import type { Express } from "express";
import https from "https";
import http from "http";

/**
 * 쿠팡 파트너스 이미지 프록시
 * - 쿠팡 이미지 URL은 Referer 제한이 있어 브라우저에서 직접 로드 불가
 * - 서버에서 이미지를 가져와 클라이언트에 전달하여 Referer 제한 우회
 * - 경로: GET /api/coupang-img?url=<encoded_image_url>
 */
export function registerCoupangImageProxy(app: Express) {
  app.get("/api/coupang-img", (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl) {
      res.status(400).send("Missing url parameter");
      return;
    }

    let imageUrl: URL;
    try {
      imageUrl = new URL(rawUrl);
    } catch {
      res.status(400).send("Invalid URL");
      return;
    }

    // 쿠팡 도메인만 허용 (보안) - ads-partners.coupang.com, static.coupangcdn.com 등 포함
    const allowedDomains = [".coupang.com", ".coupangcdn.com"];
    const isAllowed = allowedDomains.some(d => imageUrl.hostname.endsWith(d));
    if (!isAllowed) {
      res.status(403).send("Only coupang.com images are allowed");
      return;
    }

    const protocol = imageUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: imageUrl.hostname,
      path: imageUrl.pathname + imageUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.coupang.com/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
      },
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      // 이미지 Content-Type 전달
      const contentType = proxyRes.headers["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      // 캐시 헤더 설정 (1시간)
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // 리다이렉트 처리
      if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307 || proxyRes.statusCode === 308) {
        const location = proxyRes.headers["location"];
        if (location) {
          res.redirect(302, `/api/coupang-img?url=${encodeURIComponent(location)}`);
          return;
        }
      }

      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[CoupangImageProxy] Error:", err.message);
      res.status(502).send("Failed to fetch image");
    });

    proxyReq.setTimeout(10000, () => {
      proxyReq.destroy();
      res.status(504).send("Image fetch timeout");
    });

    proxyReq.end();
  });
}
