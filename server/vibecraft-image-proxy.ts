import type { Express } from "express";
import https from "https";
import http from "http";

/**
 * vibecraftx.com 이미지 프록시
 * - vibecraftx.com 이미지는 CORS 제한으로 브라우저에서 직접 로드 불가
 * - 서버에서 이미지를 가져와 클라이언트에 전달하여 CORS 제한 우회
 * - 경로: GET /api/vibecraft-img?url=<encoded_image_url>
 * - 리다이렉트 최대 5회 처리
 */
export function registerVibecraftImageProxy(app: Express) {
  function fetchImage(imageUrl: URL, res: import("express").Response, redirectCount = 0): void {
    if (redirectCount > 5) {
      res.status(502).send("Too many redirects");
      return;
    }

    const protocol = imageUrl.protocol === "https:" ? https : http;

    const options = {
      hostname: imageUrl.hostname,
      path: imageUrl.pathname + imageUrl.search,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Encoding": "identity",
        "Referer": "https://www.vibecraftx.com/",
      },
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      // 리다이렉트 처리 (301/302/307/308)
      if (
        proxyRes.statusCode &&
        [301, 302, 307, 308].includes(proxyRes.statusCode)
      ) {
        const location = proxyRes.headers["location"];
        if (location) {
          try {
            const nextUrl = new URL(location, `${imageUrl.protocol}//${imageUrl.hostname}`);
            // 소비하지 않으면 소켓이 닫히지 않음
            proxyRes.resume();
            return fetchImage(nextUrl, res, redirectCount + 1);
          } catch {
            res.status(502).send("Invalid redirect URL");
            return;
          }
        }
      }

      const contentType = proxyRes.headers["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      // 24시간 캐시 (이미지는 거의 변경되지 않음)
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (err) => {
      console.error("[VibecraftImageProxy] Error:", err.message);
      if (!res.headersSent) {
        res.status(502).send("Failed to fetch image");
      }
    });

    proxyReq.setTimeout(15000, () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).send("Image fetch timeout");
      }
    });

    proxyReq.end();
  }

  app.get("/api/vibecraft-img", (req, res) => {
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

    // vibecraftx.com 도메인만 허용 (보안)
    const allowedDomains = ["vibecraftx.com", "www.vibecraftx.com"];
    const isAllowed = allowedDomains.some(
      (d) => imageUrl.hostname === d || imageUrl.hostname.endsWith(`.${d}`)
    );
    if (!isAllowed) {
      res.status(403).send("Only vibecraftx.com images are allowed");
      return;
    }

    fetchImage(imageUrl, res);
  });
}
