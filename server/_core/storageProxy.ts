import type { Express } from "express";
import { ENV } from "./env";
import path from "path";

// 이미지 확장자 목록 (장기 캐싱 적용 대상)
const IMAGE_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.avif', '.ico']);

// WebP 변환 대상 확장자 (SVG/GIF/AVIF/ICO는 제외)
const WEBP_CONVERTIBLE = new Set(['.jpg', '.jpeg', '.png']);

// 메모리 캐시: cacheKey → 변환된 Buffer (최대 200개, LRU 방식)
const webpCache = new Map<string, { buf: Buffer; ts: number }>();
const WEBP_CACHE_MAX = 200;
const WEBP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

// 허용된 리사이즈 너비 목록 (보안: 임의 크기 방지)
const ALLOWED_WIDTHS = new Set([320, 480, 640, 800, 960, 1200]);

/**
 * 이미지를 WebP로 변환하고 선택적으로 리사이즈합니다 (메모리 캐시 포함).
 * - Accept 헤더에 image/webp가 있는 브라우저에 WebP 변환 적용
 * - ?w=N 쿼리 파라미터로 너비 리사이즈 지원 (비율 유지, 확대 없음)
 */
async function convertToWebP(imageUrl: string, cacheKey: string, resizeWidth?: number): Promise<Buffer | null> {
  const now = Date.now();

  // 캐시 히트
  const cached = webpCache.get(cacheKey);
  if (cached && now - cached.ts < WEBP_CACHE_TTL) {
    return cached.buf;
  }

  try {
    const sharp = (await import('sharp')).default;
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    let pipeline = sharp(buf);

    // 리사이즈: 너비 지정 시 비율 유지하며 축소 (확대는 하지 않음)
    if (resizeWidth && resizeWidth > 0) {
      pipeline = pipeline.resize(resizeWidth, undefined, {
        withoutEnlargement: true,
        fit: 'inside',
      });
    }

    const webpBuf = await pipeline
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    // LRU: 최대 200개 초과 시 가장 오래된 항목 제거
    if (webpCache.size >= WEBP_CACHE_MAX) {
      const oldest = Array.from(webpCache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0];
      if (oldest) webpCache.delete(oldest[0]);
    }
    webpCache.set(cacheKey, { buf: webpBuf, ts: now });
    return webpBuf;
  } catch {
    return null;
  }
}

/**
 * S3 파일 키에서 의미있는 파일명을 추출합니다.
 * filename 파라미터도 없고 DB에도 없을 때 최후 폴백으로 사용됩니다.
 */
export function extractMeaningfulFilename(basename: string): string {
  const lastDot = basename.lastIndexOf('.');
  const ext = lastDot >= 0 ? basename.slice(lastDot) : '';
  const nameWithoutExt = lastDot >= 0 ? basename.slice(0, lastDot) : basename;

  const parts = nameWithoutExt.split('_');
  const isTimestamp = parts.length >= 2 && /^\d{13}$/.test(parts[0]);

  if (isTimestamp) {
    const isHash = parts.length >= 4 && /^[a-f0-9]{8}$/.test(parts[parts.length - 1]);
    let slugParts: string[];
    if (isHash) {
      slugParts = parts.slice(2, parts.length - 1);
    } else if (parts.length >= 3) {
      slugParts = parts.slice(2);
    } else {
      slugParts = [];
    }

    if (slugParts.length > 0) {
      const fileSlug = slugParts.join('_');
      const slugWithoutEmbeddedExt = fileSlug.replace(/\.[a-zA-Z0-9]{2,5}$/, '');
      const meaningfulChars = slugWithoutEmbeddedExt.replace(/[^a-zA-Z0-9.-]/g, '');
      if (meaningfulChars.length >= 2) {
        const cleaned = slugWithoutEmbeddedExt
          .replace(/_+/g, '_')
          .replace(/^[_-]+|[_-]+$/g, '');
        if (cleaned.length > 0) {
          return cleaned + ext;
        }
      }
    }
    return 'file' + ext;
  }

  return basename;
}

/**
 * URL 쿼리 파라미터에서 filename 값을 안전하게 추출합니다.
 * 배포 환경(Nginx 프록시)에서 이중 인코딩, 중복 파라미터 등 모든 케이스를 처리합니다.
 */
export function extractFilenameParam(rawUrl: string): string | null {
  try {
    const qIdx = rawUrl.indexOf('?');
    if (qIdx < 0) return null;
    const queryStr = rawUrl.slice(qIdx + 1);

    // filename= 파라미터 추출 (첫 번째 occurrence만 사용)
    const filenameMatch = queryStr.match(/(?:^|&)filename=([^&]*)/);
    if (!filenameMatch) return null;

    let value = filenameMatch[1];
    if (!value) return null;

    // 값 안에 '?download=' 또는 '?filename=' 패턴이 포함된 경우 제거 (중복 파라미터 방어)
    const innerQIdx = value.indexOf('?');
    if (innerQIdx >= 0) {
      value = value.slice(0, innerQIdx);
    }

    // URL 디코딩 시도
    let decoded = value;
    try {
      if (/%[0-9A-Fa-f]{2}/.test(value)) {
        decoded = decodeURIComponent(value);
      }
    } catch {
      // 디코딩 실패 시 원본 값 사용
    }

    // 이중 인코딩 방어: 디코딩 후에도 %XX 패턴이 남아있으면 한 번 더 디코딩
    try {
      if (/%[0-9A-Fa-f]{2}/.test(decoded)) {
        decoded = decodeURIComponent(decoded);
      }
    } catch {
      // 무시
    }

    const trimmed = decoded.trim();
    // 'file.zip' 같은 의미없는 폴백 값은 null 반환 (DB 조회 또는 key 추출로 대체)
    if (trimmed.length === 0 || trimmed === 'file.zip' || trimmed === 'file.pdf' || trimmed === 'file.bin') {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * S3 presigned URL에서 파일을 스트리밍하고 Content-Disposition 헤더를 설정합니다.
 * RFC 5987 (filename*=UTF-8''...) 방식으로 한글 파일명을 안전하게 전달합니다.
 */
async function streamFileWithDisposition(
  res: import('express').Response,
  signedUrl: string,
  filename: string,
  isDownload: boolean
): Promise<void> {
  const fileResp = await fetch(signedUrl);
  if (!fileResp.ok) {
    res.status(502).send("Failed to fetch file from storage");
    return;
  }

  const contentType = fileResp.headers.get('content-type') ?? 'application/octet-stream';
  const contentLength = fileResp.headers.get('content-length');

  // RFC 6266 / RFC 5987:
  // - filename="..." 에는 ASCII 안전 폴백 (비ASCII → '_')
  // - filename*=UTF-8''... 에는 percent-encoding으로 한글 등 비ASCII 지원
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const rfc5987Encoded = encodeURIComponent(filename);

  if (isDownload) {
    res.set('Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`);
    res.set('Cache-Control', 'no-store');
  } else {
    res.set('Content-Disposition',
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`);
    res.set('Cache-Control', 'public, max-age=3600');
  }

  res.set('Content-Type', contentType);
  if (contentLength) res.set('Content-Length', contentLength);

  // Node.js fetch Response.body를 Express res로 파이프
  if (fileResp.body) {
    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(fileResp.body as any);
    nodeStream.pipe(res);
  } else {
    const buf = Buffer.from(await fileResp.arrayBuffer());
    res.send(buf);
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    const ext = path.extname(key).toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext);

    // ?download=1 또는 ?download=true 일 때 강제 다운로드
    const forceDownload = req.query.download === '1' || req.query.download === 'true';

    // ?w=N 리사이즈 파라미터 파싱 (허용된 너비만 적용)
    const wParam = req.query.w;
    const requestedWidth = typeof wParam === 'string' ? parseInt(wParam, 10) : 0;
    const resizeWidth = ALLOWED_WIDTHS.has(requestedWidth) ? requestedWidth : 0;

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      if (isImage && !forceDownload) {
        // WebP 자동 변환: JPG/PNG 요청 시 Accept 헤더에 image/webp가 있으면 WebP로 변환
        // WebP 이미지도 ?w=N 리사이즈 요청 시 sharp로 처리
        const acceptsWebP = (req.headers['accept'] ?? '').includes('image/webp');
        const canConvert = WEBP_CONVERTIBLE.has(ext) && acceptsWebP;
        const needsResize = resizeWidth > 0;
        // WebP 이미지에 리사이즈 요청이 있는 경우도 sharp 처리
        const isWebpResize = ext === '.webp' && needsResize;

        if (canConvert || isWebpResize) {
          // WebP 변환 + 선택적 리사이즈 (sharp + 메모리 캐시)
          // 캐시 키: key + 리사이즈 너비 (크기별로 별도 캐시)
          const cacheKey = resizeWidth > 0 ? `${key}@${resizeWidth}w` : key;
          const webpBuf = await convertToWebP(url, cacheKey, resizeWidth || undefined);
          if (webpBuf) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            res.set('Content-Type', 'image/webp');
            res.set('Vary', 'Accept');
            res.set('Content-Length', String(webpBuf.length));
            res.send(webpBuf);
            return;
          }
          // 변환 실패 시 원본 이미지로 폴백
        }

        // 원본 이미지 서빙: 직접 프록시 + 장기 캐싱
        const fileResp = await fetch(url);
        if (!fileResp.ok) {
          res.status(502).send("Failed to fetch image from storage");
          return;
        }
        const contentType = fileResp.headers.get('content-type') ?? `image/${ext.slice(1) || 'webp'}`;
        const contentLength = fileResp.headers.get('content-length');

        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Content-Type', contentType);
        if (canConvert) res.set('Vary', 'Accept'); // WebP 지원 브라우저에서 원본 서빙 시도 Vary 헤더 유지
        if (contentLength) res.set('Content-Length', contentLength);

        if (fileResp.body) {
          const { Readable } = await import('stream');
          const nodeStream = Readable.fromWeb(fileResp.body as any);
          nodeStream.pipe(res);
        } else {
          const buf = Buffer.from(await fileResp.arrayBuffer());
          res.send(buf);
        }
      } else {
        // 비이미지 파일 또는 이미지 강제 다운로드:
        // 항상 서버 스트리밍 + Content-Disposition 헤더 설정
        //
        // 파일명 결정 우선순위:
        //   1. DB에서 조회 (file_metadata 테이블) - 가장 신뢰할 수 있는 방법
        //   2. URL 파라미터 (req.originalUrl에서 직접 파싱)
        //   3. Express req.query.filename 폴백
        //   4. S3 key에서 의미있는 파일명 추출 (구버전 URL)

        let filename: string | null = null;

        // 전략 1: DB에서 원본 파일명 조회 (가장 신뢰할 수 있는 방법)
        // Nginx 프록시나 URL 인코딩 문제와 완전히 무관하게 동작
        try {
          const { getOriginalFilename } = await import('../db');
          filename = await getOriginalFilename(key);
          if (filename) {
            console.log(`[StorageProxy] DB filename: "${filename}" for key: ${key}`);
          }
        } catch (dbErr) {
          console.warn('[StorageProxy] DB lookup failed:', dbErr);
        }

        // 전략 2: originalUrl에서 직접 파싱 (배포 환경 프록시 이중 디코딩 문제 방지)
        if (!filename && req.originalUrl) {
          filename = extractFilenameParam(req.originalUrl);
          if (filename) {
            console.log(`[StorageProxy] URL param filename: "${filename}" for key: ${key}`);
          }
        }

        // 전략 3: Express req.query 폴백
        if (!filename && req.query.filename) {
          const qVal = req.query.filename as string;
          const cleaned = qVal.replace(/\?download=.*$/, '').replace(/\?filename=.*$/, '').trim();
          if (cleaned.length > 0 && cleaned !== 'file.zip' && cleaned !== 'file.pdf') {
            filename = cleaned;
          }
        }

        // 전략 4: S3 key에서 추출 (파라미터 없는 구버전 URL)
        if (!filename) {
          filename = extractMeaningfulFilename(path.basename(key));
          console.log(`[StorageProxy] Key-extracted filename: "${filename}" for key: ${key}`);
        }

        await streamFileWithDisposition(res, url, filename, true);
      }
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
