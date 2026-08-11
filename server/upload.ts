import express from "express";
import type { Express, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { storageFetch, storagePut } from "./storage";
import { saveFileMetadata, getOriginalFilename } from "./db";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import sharp from "sharp";

/**
 * multer는 multipart/form-data 파일명을 latin1로 파싱함.
 * 브라우저가 UTF-8로 인코딩한 한글 파일명을 올바르게 복원.
 */
function decodeFilename(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

/**
 * S3 파일 경로(key)는 ASCII만 허용됨.
 * 한글 등 비ASCII 문자를 제거하고 공백/특수문자를 언더스코어로 대체.
 * 비어있으면 랜덤 슬러그 반환.
 */
function toAsciiKey(name: string): string {
  const ascii = name
    .replace(/[^\x00-\x7F]/g, '')    // 비ASCII 제거
    .replace(/\s+/g, '_')             // 공백 → _
    .replace(/[^a-zA-Z0-9._-]/g, '_') // 특수문자 → _
    .replace(/_+/g, '_')              // 연속 _ 정리
    .replace(/^_|_$/g, '')            // 앞뒤 _ 제거
    .slice(0, 80);                    // 길이 제한
  return ascii || Math.random().toString(36).slice(2);
}

// ─── 이미지 최적화 설정 ────────────────────────────────────────────────────────
const IMAGE_OPTIMIZE = {
  // 썸네일/일반 이미지 최대 너비 (px). 이 이상이면 리사이징
  maxWidth: 1200,
  // WebP 품질 (0~100). 80이면 육안 차이 거의 없음
  webpQuality: 82,
  // GIF/SVG는 변환 제외 (애니메이션 보존, 벡터 유지)
  skipMimeTypes: ["image/gif", "image/svg+xml"],
};

// 반응형 이미지 브레이크포인트 (px)
const RESPONSIVE_WIDTHS = [320, 640, 1200] as const;

/**
 * 이미지 버퍼를 WebP로 변환 + 최대 너비 리사이징
 * GIF/SVG는 원본 그대로 반환
 */
async function optimizeImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string; ext: string }> {
  // 변환 제외 포맷
  if (IMAGE_OPTIMIZE.skipMimeTypes.includes(mimeType)) {
    const ext = mimeType.split("/")[1] || "bin";
    return { buffer, mimeType, ext };
  }

  try {
    const img = sharp(buffer);
    const meta = await img.metadata();

    // 너비가 maxWidth 초과 시 리사이징 (비율 유지, 확대는 하지 않음)
    const needsResize =
      meta.width && meta.width > IMAGE_OPTIMIZE.maxWidth;

    const pipeline = needsResize
      ? img.resize({ width: IMAGE_OPTIMIZE.maxWidth, withoutEnlargement: true })
      : img;

    const optimized = await pipeline
      .webp({ quality: IMAGE_OPTIMIZE.webpQuality })
      .toBuffer();

    return { buffer: optimized, mimeType: "image/webp", ext: "webp" };
  } catch (err) {
    // Sharp 처리 실패 시 원본 그대로 업로드 (안전 폴백)
    console.warn("[Upload] Sharp optimization failed, using original:", err);
    const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    return { buffer, mimeType, ext };
  }
}

/**
 * 다중 해상도 WebP 생성 — 반응형 이미지(srcset) 지원
 * 320w / 640w / 1200w 세 가지 크기를 병렬 생성하여 S3에 저장
 * GIF/SVG는 단일 해상도만 생성 (원본 포맷 유지)
 *
 * @returns { url, srcset, key } — url은 1200w 기준 URL, srcset은 브라우저 srcset 문자열
 */
export async function generateResponsiveImages(
  buffer: Buffer,
  mimeType: string,
  baseKey: string
): Promise<{ url: string; srcset: string; key: string }> {
  // GIF/SVG는 단일 해상도만 생성
  if (IMAGE_OPTIMIZE.skipMimeTypes.includes(mimeType)) {
    const ext = mimeType.split("/")[1] || "bin";
    const key = `${baseKey}.${ext}`;
    const { url } = await storagePut(key, buffer, mimeType);
    return { url, srcset: url, key };
  }

  try {
    const img = sharp(buffer);
    const meta = await img.metadata();
    const originalWidth = meta.width ?? 1200;

    // 원본보다 큰 크기는 생성하지 않음 (withoutEnlargement)
    const widthsToGenerate = RESPONSIVE_WIDTHS.filter(w => w <= originalWidth);
    // 항상 최소 1개(원본 또는 1200w) 생성
    if (widthsToGenerate.length === 0) widthsToGenerate.push(originalWidth as typeof RESPONSIVE_WIDTHS[number]);

    // 병렬로 각 해상도 WebP 생성 + S3 업로드
    const results = await Promise.all(
      widthsToGenerate.map(async (w) => {
        const resized = await sharp(buffer)
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: IMAGE_OPTIMIZE.webpQuality })
          .toBuffer();
        const key = `${baseKey}_${w}w.webp`;
        const { url } = await storagePut(key, resized, "image/webp");
        return { width: w, url, key };
      })
    );

    // srcset 문자열 생성 (예: "/manus-storage/...320w.webp 320w, ...640w.webp 640w, ...1200w.webp 1200w")
    const srcset = results.map(r => `${r.url} ${r.width}w`).join(", ");

    // 기본 URL은 가장 큰 해상도 (1200w 또는 원본)
    const largest = results[results.length - 1];
    return { url: largest.url, srcset, key: largest.key };
  } catch (err) {
    // Sharp 처리 실패 시 단일 해상도 폴백
    console.warn("[Upload] Responsive image generation failed, falling back to single:", err);
    const { buffer: fallbackBuf, mimeType: outMime, ext } = await optimizeImage(buffer, mimeType);
    const key = `${baseKey}.${ext}`;
    const { url } = await storagePut(key, fallbackBuf, outMime);
    return { url, srcset: url, key };
  }
}

// 이미지 전용 multer (5MB 제한)
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`허용되지 않는 이미지 형식입니다: ${file.mimetype}`));
    }
  },
});

// ZIP 파일 전용 multer (50MB 제한)
const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('ZIP 파일만 업로드 가능합니다.'));
    }
  },
});

// HTML + 이미지 묶음 업로드 multer (50MB 제한, 다중 파일)
const uploadHtmlWithImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 파일당 20MB
    files: 50, // 최대 50개 파일
  },
});

// HTML 앱 파일 전용 multer (10MB 제한 - base64 이미지 내장 HTML 지원)
const uploadHtml = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ["text/html", "application/xhtml+xml"];
    // 브라우저마다 .html 파일의 mimetype이 다를 수 있어 확장자로도 허용
    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ext === "html" || ext === "htm") {
      cb(null, true);
    } else {
      cb(new Error(`HTML 파일(.html, .htm)만 업로드 가능합니다.`));
    }
  },
});

// ─── 파일 종류별 업로드 크기 제한 ─────────────────────────────────────────────
// 문서류(PDF, Word, PPT, Excel, HWP 등): 50MB
// 압축파일(ZIP, RAR, 7z 등): 100MB
// 이미지(첨부용): 20MB
// 기타 모든 파일: 50MB
const FILE_SIZE_LIMITS: Record<string, number> = {
  // 문서
  'application/pdf':                                              50 * 1024 * 1024,
  'application/msword':                                          50 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 50 * 1024 * 1024,
  'application/vnd.ms-excel':                                    50 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       50 * 1024 * 1024,
  'application/vnd.ms-powerpoint':                               50 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 50 * 1024 * 1024,
  'application/haansofthwp':                                     50 * 1024 * 1024,
  'application/x-hwp':                                           50 * 1024 * 1024,
  'text/plain':                                                  10 * 1024 * 1024,
  'text/csv':                                                    20 * 1024 * 1024,
  // 압축
  'application/zip':                                            100 * 1024 * 1024,
  'application/x-zip-compressed':                               100 * 1024 * 1024,
  'application/x-rar-compressed':                               100 * 1024 * 1024,
  'application/x-7z-compressed':                                100 * 1024 * 1024,
  'application/gzip':                                           100 * 1024 * 1024,
};
const FILE_EXT_LIMITS: Record<string, number> = {
  pdf: 50 * 1024 * 1024,
  doc: 50 * 1024 * 1024, docx: 50 * 1024 * 1024,
  xls: 50 * 1024 * 1024, xlsx: 50 * 1024 * 1024,
  ppt: 50 * 1024 * 1024, pptx: 50 * 1024 * 1024,
  hwp: 50 * 1024 * 1024, hwpx: 50 * 1024 * 1024,
  txt: 10 * 1024 * 1024, csv: 20 * 1024 * 1024,
  zip: 100 * 1024 * 1024, rar: 100 * 1024 * 1024,
  '7z': 100 * 1024 * 1024, gz: 100 * 1024 * 1024, tar: 100 * 1024 * 1024,
};
const DEFAULT_FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 기타 파일 기본 50MB

function getFileSizeLimit(mimetype: string, filename: string): number {
  if (FILE_SIZE_LIMITS[mimetype]) return FILE_SIZE_LIMITS[mimetype];
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return FILE_EXT_LIMITS[ext] ?? DEFAULT_FILE_SIZE_LIMIT;
}

// 파일 첨부 전용 multer (파일 종류별 크기 제한 - 최대 100MB까지 허용 후 서버에서 재검증)
const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // multer 하드 상한 100MB (실제 제한은 서버에서 재검증)
  },
  // fileFilter 없음 - 모든 파일 형식 허용 (.hwp, .7z, .rar, .mp4 등)
});

// 영상 전용 multer (200MB 제한 - mp4/webm/mov/avi/mkv 허용)
const uploadVideo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/ogg'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('영상 파일만 업로드 가능합니다. (mp4, webm, mov, avi, mkv)'));
    }
  },
});

async function getAuthUser(req: Request) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return null;
    const payload = await sdk.verifySession(token);
    return payload;
  } catch {
    return null;
  }
}

/**
 * 외부 URL 이미지를 서버에서 fetch하여 S3에 업로드하고 내부 URL 반환
 * HTML 붙여넣기 시 외부 이미지 src를 영구 저장 URL로 교체하는 데 사용
 * - 이미지 파일은 WebP로 자동 변환 + 리사이징 적용
 */
export async function uploadImageFromUrl(imageUrl: string, userId: string): Promise<{ url: string; key: string }> {
  // base64 dataURL 처리
  if (imageUrl.startsWith('data:')) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('잘못된 base64 이미지 형식입니다.');
    const mimeType = matches[1];
    const base64Data = matches[2];
    const rawBuffer = Buffer.from(base64Data, 'base64');

    const { buffer, mimeType: outMime, ext } = await optimizeImage(rawBuffer, mimeType);
    const key = `uploads/images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    return storagePut(key, buffer, outMime);
  }

  // 외부 URL 이미지 fetch
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WordCracker/1.0)' },
    });
    if (!response.ok) throw new Error(`이미지 fetch 실패: ${response.status}`);

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    if (!mimeType.startsWith('image/')) throw new Error('이미지 파일이 아닙니다.');

    const rawBuffer = Buffer.from(await response.arrayBuffer());
    if (rawBuffer.length > 20 * 1024 * 1024) throw new Error('이미지 크기가 20MB를 초과합니다.');

    const { buffer, mimeType: outMime, ext } = await optimizeImage(rawBuffer, mimeType);
    const key = `uploads/images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    return storagePut(key, buffer, outMime);
  } finally {
    clearTimeout(timeout);
  }
}

export function registerUploadRoutes(app: Express) {
  // Image upload endpoint (WebP 자동 변환 + 리사이징 적용, 5MB 제한)
  app.post(
    "/api/upload/image",
    uploadImage.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: "로그인이 필요합니다." });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "파일이 없습니다." });
          return;
        }

        const file = req.file;
        const originalSize = file.size;
        const decodedName = decodeFilename(file.originalname);

        // 다중 해상도 WebP 생성 (320w/640w/1200w)
        const baseKey = `uploads/images/${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const { url, srcset, key } = await generateResponsiveImages(file.buffer, file.mimetype, baseKey);

        // 최적화 결과 로그
        console.log(`[Upload] Responsive images generated: ${originalSize}B original → ${key}`);

        res.json({
          url,
          srcset,
          key,
          filename: decodedName,
          originalSize,
          optimized: true,
        });
      } catch (err: unknown) {
        console.error("[Upload] Image upload failed:", err);
        const message = err instanceof Error ? err.message : "업로드 실패";
        res.status(500).json({ error: message });
      }
    }
  );

  // Image from URL upload endpoint (HTML paste 시 외부 이미지 업로드)
  app.post(
    "/api/upload/image-from-url",
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: "로그인이 필요합니다." });
          return;
        }

        const { imageUrl } = req.body as { imageUrl?: string };
        if (!imageUrl || typeof imageUrl !== 'string') {
          res.status(400).json({ error: 'imageUrl이 필요합니다.' });
          return;
        }

        const result = await uploadImageFromUrl(imageUrl, user.openId);
        res.json({ url: result.url, key: result.key });
      } catch (err: unknown) {
        console.error('[Upload] Image from URL failed:', err);
        const message = err instanceof Error ? err.message : '업로드 실패';
        res.status(500).json({ error: message });
      }
    }
  );

  // HTML 앱 파일 업로드 엔드포인트 (S3에 저장 → URL 반환)
  app.post(
    "/api/upload/html",
    uploadHtml.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: "로그인이 필요합니다." });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "파일이 없습니다." });
          return;
        }

        const file = req.file;
        const decodedHtmlName = decodeFilename(file.originalname);
        const safeName = toAsciiKey(decodedHtmlName);
        const key = `uploads/html-apps/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
        const { url } = await storagePut(key, file.buffer, "text/html; charset=utf-8");

        console.log(`[Upload] HTML app uploaded: ${decodedHtmlName} → ${key} (${file.size}B)`);
        res.json({ url, key, filename: decodedHtmlName, size: file.size });
      } catch (err: unknown) {
        console.error("[Upload] HTML upload failed:", err);
        const message = err instanceof Error ? err.message : "업로드 실패";
        res.status(500).json({ error: message });
      }
    }
  );

    // ZIP 파일 업로드 엔드포인트 (SSE 스트리밍 - 진행률 실시간 전송)
  // ZIP 안에 HTML파일 + 이미지들이 있으면 자동으로 이미지를 S3엔 업로드하고 HTML src를 교체하여 반환
  app.post(
    '/api/upload/html-zip',
    uploadZip.single('file'),
        async (req: Request, res: Response) => {
      // SSE 헤더 설정
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const sendEvent = (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const user = await getAuthUser(req);
        if (!user) { sendEvent({ type: 'error', error: '로그인이 필요합니다.' }); res.end(); return; }
        if (!req.file) { sendEvent({ type: 'error', error: 'ZIP 파일이 없습니다.' }); res.end(); return; }

        const zip = new AdmZip(req.file.buffer);
        const entries = zip.getEntries();
        // HTML 파일 찾기 (루트 또는 서브폴더 안의 .html/.htm)
        const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|svg|bmp|ico|tiff?)$/i;
        const htmlEntry = entries.find(e =>
          !e.isDirectory &&
          /\.html?$/i.test(e.entryName) &&
          !e.entryName.startsWith('__MACOSX')
        );
                if (!htmlEntry) {
          sendEvent({ type: 'error', error: 'ZIP 안에 HTML 파일이 없습니다.' });
          res.end();
          return;
        }
        // 이미지 파일들 추출 및 S3 업로드
        const imageEntries = entries.filter(e =>
          !e.isDirectory &&
          IMAGE_EXTS.test(e.entryName) &&
          !e.entryName.startsWith('__MACOSX')
        );
        const totalImages = imageEntries.length;
        // 이미지 업로드 시작 이벤트
        sendEvent({ type: 'start', total: totalImages });
        const imageUrlMap: Record<string, string> = {};
        let uploadedCount = 0;
        const failedFiles: string[] = [];
        for (const imgEntry of imageEntries) {
          try {
            const imgBuffer = imgEntry.getData();
            const ext = imgEntry.entryName.split('.').pop()?.toLowerCase() || 'jpg';
            const mimeMap: Record<string, string> = {
              jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
              gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
              bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff', tif: 'image/tiff',
            };
            const mimeType = mimeMap[ext] || 'image/jpeg';
            const { buffer: optBuf, mimeType: outMime, ext: outExt } = await optimizeImage(imgBuffer, mimeType);
            const key = `uploads/images/${Date.now()}_${Math.random().toString(36).slice(2)}.${outExt}`;
            const { url } = await storagePut(key, optBuf, outMime);
            // 파일명만 추출 (ZIP 내 경로 제거)
            const fileName = imgEntry.entryName.split('/').pop() || imgEntry.entryName;
            // 다양한 경로 패턴 자동 매핑 (폴더명 무관하게 모두 대응)
            // 1) 전체 경로: images/photo.png, assets/photo.png, img/photo.png 등
            imageUrlMap[imgEntry.entryName] = url;
            // 2) 파일명만: photo.png
            imageUrlMap[fileName] = url;
            // 3) 디코딩/인코딩 변형
            try { imageUrlMap[decodeURIComponent(fileName)] = url; } catch {}
            try { imageUrlMap[encodeURIComponent(fileName)] = url; } catch {}
            try { imageUrlMap[decodeURIComponent(imgEntry.entryName)] = url; } catch {}
            try { imageUrlMap[encodeURIComponent(imgEntry.entryName)] = url; } catch {}
            // 4) 상대 경로 패턴 매핑: ./images/photo.png, ../images/photo.png, ./assets/photo.png 등
            imageUrlMap[`./${imgEntry.entryName}`] = url;
            imageUrlMap[`../${imgEntry.entryName}`] = url;
            imageUrlMap[`./${fileName}`] = url;
            imageUrlMap[`../${fileName}`] = url;
            // 5) 폴더명 없이 파일명만으로 참조하는 경우도 매핑
            try { imageUrlMap[`./${decodeURIComponent(fileName)}`] = url; } catch {}
            try { imageUrlMap[`../${decodeURIComponent(fileName)}`] = url; } catch {}
            uploadedCount++;
            // 진행률 이벤트 전송
            sendEvent({ type: 'progress', current: uploadedCount, total: totalImages, fileName });
            console.log(`[ZIP Upload] Image (${uploadedCount}/${totalImages}): ${fileName} → ${url}`);
          } catch (e) {
            console.warn(`[ZIP Upload] Image failed: ${imgEntry.entryName}`, e);
            uploadedCount++;
            const failedName = imgEntry.entryName.split('/').pop() || imgEntry.entryName;
            failedFiles.push(failedName);
            sendEvent({ type: 'progress', current: uploadedCount, total: totalImages, fileName: failedName, failed: true });
          }
        }

        // HTML 내 src 교체 (로컬 파일명 및 다양한 폴더 구조 자동 대응)
        let htmlContent = htmlEntry.getData().toString('utf-8');
        // 유틸리티: srcValue로 스토리지 URL 찾기 (전체 경로 우선, 파일명 폴백)
        const resolveUrl = (srcValue: string): string | null => {
          if (!srcValue || srcValue.startsWith('http://') || srcValue.startsWith('https://') ||
              srcValue.startsWith('/') || srcValue.startsWith('data:') || srcValue.startsWith('blob:')) return null;
          // 정리된 경로 (./제거, ../제거)
          const normalizedSrc = srcValue.replace(/^\.\.\//, '').replace(/^\.\//,'');
          const fileName = srcValue.split('/').pop() || srcValue;
          const decodedSrc = (() => { try { return decodeURIComponent(srcValue); } catch { return srcValue; } })();
          const decodedNorm = (() => { try { return decodeURIComponent(normalizedSrc); } catch { return normalizedSrc; } })();
          const decodedFile = (() => { try { return decodeURIComponent(fileName); } catch { return fileName; } })();
          // 우선순위: 1)원본 경로 전체 2)정규화 경로 3)디코딩 경로 4)파일명만
          return imageUrlMap[srcValue] ||
                 imageUrlMap[normalizedSrc] ||
                 imageUrlMap[decodedSrc] ||
                 imageUrlMap[decodedNorm] ||
                 imageUrlMap[fileName] ||
                 imageUrlMap[decodedFile] ||
                 imageUrlMap[encodeURIComponent(fileName)] ||
                 imageUrlMap[encodeURIComponent(decodedFile)] ||
                 null;
        };
        htmlContent = htmlContent.replace(
          /(<img[^>]+src=)["']([^"']+)["']/gi,
          (match, prefix, srcValue) => {
            const newUrl = resolveUrl(srcValue);
            if (newUrl) { console.log(`[ZIP Upload] Replaced img src: ${srcValue} → ${newUrl}`); return `${prefix}"${newUrl}"`; }
            return match;
          }
        );
        // <source srcset>, <video poster>, <audio src> 등 미디어 태그도 교체
        htmlContent = htmlContent.replace(
          /(<(?:source|video|audio|track)[^>]+src=)["']([^"']+)["']/gi,
          (match, prefix, srcValue) => {
            const newUrl = resolveUrl(srcValue);
            if (newUrl) { console.log(`[ZIP Upload] Replaced media src: ${srcValue} → ${newUrl}`); return `${prefix}"${newUrl}"`; }
            return match;
          }
        );
        // CSS background-image url() 교체
        htmlContent = htmlContent.replace(
          /url\(["']?([^"')]+)["']?\)/gi,
          (match, urlValue) => {
            const newUrl = resolveUrl(urlValue);
            if (newUrl) return `url("${newUrl}")`;
            return match;
          }
        );

        // 2단계: base64 이미지 추출 및 S3 업로드
        const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
        const base64MatchesRaw = htmlContent.match(base64Pattern) || [];
        const base64Matches = Array.from(new Set(base64MatchesRaw));
        let base64Count = 0;
        if (base64Matches.length > 0) {
          console.log(`[ZIP Upload] Found ${base64Matches.length} base64 images, uploading...`);
          const base64UrlMap: Record<string, string> = {};
          for (const dataUrl of base64Matches) {
            try {
              const { url } = await uploadImageFromUrl(dataUrl, user.openId);
              base64UrlMap[dataUrl] = url;
              base64Count++;
              console.log(`[ZIP Upload] base64 → ${url}`);
            } catch (e) {
              console.warn('[ZIP Upload] base64 upload failed:', e);
            }
          }
          // base64 데이터 URL을 스토리지 URL로 교체
          for (const [dataUrl, storageUrl] of Object.entries(base64UrlMap)) {
            htmlContent = htmlContent.split(dataUrl).join(storageUrl);
          }
        }

        const finalImageCount = imageEntries.length + base64Count;
        console.log(`[ZIP Upload] Done: ${imageEntries.length} file images + ${base64Count} base64 images, HTML: ${htmlEntry.entryName}`);
        // SSE 완료 이벤트 전송
        sendEvent({
          type: 'done',
          html: htmlContent,
          imageCount: finalImageCount,
          htmlFileName: htmlEntry.entryName,
          failedFiles,
          successCount: imageEntries.length - failedFiles.length + base64Count,
        });
        res.end();
      } catch (err: unknown) {
        console.error('[ZIP Upload] Failed:', err);
        sendEvent({ type: 'error', error: err instanceof Error ? err.message : '업로드 실패' });
        res.end();
      }
    }
  );

  // HTML + 이미지 묶음 업로드 엔드포인트
  // 클라이언트에서 HTML 파일 + 이미지 파일들을 한 번에 전송하면
  // 이미지를 S3에 업로드하고 HTML 내 src 속성을 스토리지 URL로 교체하여 반환
  app.post(
    "/api/upload/html-with-images",
    uploadHtmlWithImages.any(),
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: "로그인이 필요합니다." });
          return;
        }
        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
          res.status(400).json({ error: "파일이 없습니다." });
          return;
        }

        // HTML 파일과 이미지 파일 분리
        const htmlFile = files.find(f => f.fieldname === 'html');
        const imageFiles = files.filter(f => f.fieldname === 'images');

        if (!htmlFile) {
          res.status(400).json({ error: 'HTML 파일이 없습니다.' });
          return;
        }

        // HTML 텍스트 읽기
        let htmlContent = htmlFile.buffer.toString('utf-8');

        // 이미지 파일들을 S3엔 업로드하고 매핑 생성
        const imageUrlMap: Record<string, string> = {};
        for (const imgFile of imageFiles) {
          try {
            const { buffer, mimeType: outMime, ext } = await optimizeImage(imgFile.buffer, imgFile.mimetype);
            const baseKey = `uploads/images/${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const key = `${baseKey}.${ext}`;
            const { url } = await storagePut(key, buffer, outMime);
            // 원본 파일명 매핑 (다양한 파일명 형태 대응)
            const originalName = decodeFilename(imgFile.originalname);
            imageUrlMap[originalName] = url;
            // 인코딩된 파일명도 매핑 (URL 인코딩 대응)
            try { imageUrlMap[decodeURIComponent(originalName)] = url; } catch {}
            try { imageUrlMap[encodeURIComponent(originalName)] = url; } catch {}
            console.log(`[Upload] HTML image uploaded: ${originalName} → ${url}`);
          } catch (imgErr) {
            console.warn(`[Upload] Image upload failed for ${imgFile.originalname}:`, imgErr);
          }
        }

        // HTML 내 이미지 src 속성 교체
        // 다양한 패턴 대응: src="파일.png", src='파일.png', src="./파일.png"
        htmlContent = htmlContent.replace(
          /(<img[^>]+src=)["']([^"']+)["']/gi,
          (match, prefix, srcValue) => {
            // 이미 절대 URL이면 교체 안 함
            if (srcValue.startsWith('http://') || srcValue.startsWith('https://') ||
                srcValue.startsWith('/') || srcValue.startsWith('data:')) {
              return match;
            }
            // 상대 경로에서 파일명 추출 (./파일.png → 파일.png)
            const fileName = srcValue.split('/').pop() || srcValue;
            const decodedFileName = (() => { try { return decodeURIComponent(fileName); } catch { return fileName; } })();

            // 매핑에서 URL 찾기
            const newUrl = imageUrlMap[fileName] || imageUrlMap[decodedFileName] ||
                           imageUrlMap[encodeURIComponent(fileName)] || imageUrlMap[encodeURIComponent(decodedFileName)];
            if (newUrl) {
              console.log(`[Upload] Replaced src: ${srcValue} → ${newUrl}`);
              return `${prefix}"${newUrl}"`;
            }
            return match; // 매핑 없으면 원본 유지
          }
        );

        // CSS background-image url() 패턴도 교체
        htmlContent = htmlContent.replace(
          /url\(["']?([^"')]+)["']?\)/gi,
          (match, urlValue) => {
            if (urlValue.startsWith('http://') || urlValue.startsWith('https://') ||
                urlValue.startsWith('/') || urlValue.startsWith('data:') || urlValue.startsWith('#')) {
              return match;
            }
            const fileName = urlValue.split('/').pop() || urlValue;
            const decodedFileName = (() => { try { return decodeURIComponent(fileName); } catch { return fileName; } })();
            const newUrl = imageUrlMap[fileName] || imageUrlMap[decodedFileName];
            if (newUrl) return `url("${newUrl}")`;
            return match;
          }
        );

                // base64 이미지 추출 및 S3 업로드
        const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
        const base64MatchesRaw2 = htmlContent.match(base64Pattern) || [];
        const base64Matches = Array.from(new Set(base64MatchesRaw2));
        let base64Count = 0;
        if (base64Matches.length > 0) {
          console.log(`[Upload] Found ${base64Matches.length} base64 images, uploading...`);
          const base64UrlMap: Record<string, string> = {};
          for (const dataUrl of base64Matches) {
            try {
              const { url } = await uploadImageFromUrl(dataUrl, user.openId);
              base64UrlMap[dataUrl] = url;
              base64Count++;
              console.log(`[Upload] base64 → ${url}`);
            } catch (e) {
              console.warn('[Upload] base64 upload failed:', e);
            }
          }
          for (const [dataUrl, storageUrl] of Object.entries(base64UrlMap)) {
            htmlContent = htmlContent.split(dataUrl).join(storageUrl);
          }
        }

        const replacedCount = Object.keys(imageUrlMap).length;
        const totalImages = imageFiles.length + base64Count;
        console.log(`[Upload] HTML processed: ${imageFiles.length} file images + ${base64Count} base64 images, ${replacedCount} src mappings`);
        res.json({
          html: htmlContent,
          imageCount: totalImages,
          replacedCount,
          imageUrls: imageUrlMap,
        });
      } catch (err: unknown) {
        console.error('[Upload] HTML with images failed:', err);
        const message = err instanceof Error ? err.message : '업로드 실패';
        res.status(500).json({ error: message });
      }
    }
  );

  // File attachment upload endpoint (파일 종류별 크기 제한: 문서 50MB, 압축 100MB, 기타 50MB)
  app.post(
    "/api/upload/file",
    uploadFile.single("file"),
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: "로그인이 필요합니다." });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: "파일이 없습니다." });
          return;
        }

        const file = req.file;
        const decodedFileName = decodeFilename(file.originalname);

        // 파일 종류별 크기 제한 재검증
        const sizeLimit = getFileSizeLimit(file.mimetype, decodedFileName);
        if (file.size > sizeLimit) {
          const limitMB = (sizeLimit / 1024 / 1024).toFixed(0);
          const fileMB = (file.size / 1024 / 1024).toFixed(1);
          res.status(413).json({
            error: `파일 크기가 제한을 초과합니다. (현재: ${fileMB}MB / 제한: ${limitMB}MB)`,
          });
          return;
        }

        const isImage = file.mimetype.startsWith("image/");

        if (isImage) {
          // 이미지 파일은 WebP 변환 + 리사이징
          const { buffer, mimeType: outMime, ext } = await optimizeImage(file.buffer, file.mimetype);
          const key = `uploads/files/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const { url } = await storagePut(key, buffer, outMime);
          res.json({ url, key, filename: decodedFileName, size: buffer.length, mimetype: outMime });
        } else {
          // 이미지 외 파일은 원본 그대로
          // 확장자를 먼저 분리한 후 파일명 부분만 toAsciiKey 처리 (확장자가 slug에 포함되지 않도록)
          const lastDotIdx = decodedFileName.lastIndexOf('.');
          const ext = lastDotIdx >= 0
            ? decodedFileName.slice(lastDotIdx + 1).replace(/[^a-zA-Z0-9]/g, '') || 'bin'
            : 'bin';
          const nameWithoutExt = lastDotIdx >= 0 ? decodedFileName.slice(0, lastDotIdx) : decodedFileName;
          // S3 key는 ASCII만 허용: toAsciiKey 헬퍼로 한글 제거 (확장자 제외한 파일명만 처리)
          const fileSlug = toAsciiKey(nameWithoutExt);
          const key = `uploads/files/${Date.now()}_${Math.random().toString(36).slice(2)}_${fileSlug}.${ext}`;
          const { url: storageUrl } = await storagePut(key, file.buffer, file.mimetype);
          // DB에 원본 파일명 저장 (storageProxy가 URL 파라미터 대신 DB에서 조회)
          // URL 파라미터 방식은 Nginx 프록시 환경에서 인코딩 문제 발생 가능
          await saveFileMetadata(key, decodedFileName, file.size, file.mimetype);
          // 응답 URL에 ?download=1&filename= 파라미터도 포함 (하위 호환성 유지)
          const url = `${storageUrl}?download=1&filename=${encodeURIComponent(decodedFileName)}`;
          res.json({ url, key, filename: decodedFileName, size: file.size, mimetype: file.mimetype });
        }
      } catch (err: unknown) {
        console.error("[Upload] File upload failed:", err);
        const message = err instanceof Error ? err.message : "업로드 실패";
        res.status(500).json({ error: message });
      }
    }
  );

  // HTML 붙여넣기 모드 - base64 이미지 자동 스토리지 변환 엔드포인트 (SSE 스트리밍)
  app.post(
    '/api/upload/html-base64',
    express.json({ limit: '50mb' }),
    async (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const sendEvent = (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const user = await getAuthUser(req);
        if (!user) { sendEvent({ type: 'error', error: '로그인이 필요합니다.' }); res.end(); return; }
        const { html } = req.body as { html?: string };
        if (!html) { sendEvent({ type: 'error', error: 'HTML이 없습니다.' }); res.end(); return; }

        // base64 이미지 추출 (중복 제거)
        const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
        const base64MatchesRaw = html.match(base64Pattern) || [];
        const base64Matches = Array.from(new Set(base64MatchesRaw));

        if (base64Matches.length === 0) {
          sendEvent({ type: 'done', html, imageCount: 0 });
          res.end();
          return;
        }

        sendEvent({ type: 'start', total: base64Matches.length });
        console.log(`[HTML Base64] Found ${base64Matches.length} base64 images, uploading...`);

        const base64UrlMap: Record<string, string> = {};
        let successCount = 0;
        const failedIndexes: number[] = [];
        for (let i = 0; i < base64Matches.length; i++) {
          const dataUrl = base64Matches[i];
          try {
            const { url } = await uploadImageFromUrl(dataUrl, user.openId);
            base64UrlMap[dataUrl] = url;
            successCount++;
            sendEvent({ type: 'progress', current: i + 1, total: base64Matches.length });
          } catch (e) {
            console.warn(`[HTML Base64] base64 upload failed (${i + 1}):`, e);
            failedIndexes.push(i + 1);
            sendEvent({ type: 'progress', current: i + 1, total: base64Matches.length, failed: true });
          }
        }

        let processedHtml = html;
        for (const [dataUrl, storageUrl] of Object.entries(base64UrlMap)) {
          processedHtml = processedHtml.split(dataUrl).join(storageUrl);
        }

        sendEvent({ type: 'done', html: processedHtml, imageCount: successCount, failedCount: failedIndexes.length, failedIndexes });
        res.end();
      } catch (err: unknown) {
        console.error('[HTML Base64] Failed:', err);
        sendEvent({ type: 'error', error: err instanceof Error ? err.message : '변환 실패' });
        res.end();
      }
    }
  );

  // HTML 파일 단독 업로드 + base64 이미지 자동 스토리지 변환 (SSE 스트리밍)
  // html-with-images와 달리 파일 하나만 받아 base64를 SSE로 처리
  app.post(
    '/api/upload/html-file-sse',
    uploadHtml.single('html'),
    async (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      const sendEvent = (data: object) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      try {
        const user = await getAuthUser(req);
        if (!user) { sendEvent({ type: 'error', error: '로그인이 필요합니다.' }); res.end(); return; }
        const htmlFile = req.file;
        if (!htmlFile) { sendEvent({ type: 'error', error: 'HTML 파일이 없습니다.' }); res.end(); return; }
        let htmlContent = htmlFile.buffer.toString('utf-8');
        // base64 이미지 추출 (중복 제거)
        const base64Pattern = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
        const base64MatchesRaw = htmlContent.match(base64Pattern) || [];
        const base64Matches = Array.from(new Set(base64MatchesRaw));
        if (base64Matches.length === 0) {
          sendEvent({ type: 'done', html: htmlContent, imageCount: 0, failedFiles: [] });
          res.end();
          return;
        }
        sendEvent({ type: 'start', total: base64Matches.length });
        console.log(`[HTML File SSE] Found ${base64Matches.length} base64 images, uploading...`);
        const base64UrlMap: Record<string, string> = {};
        let successCount = 0;
        const failedFiles: string[] = [];
        for (let i = 0; i < base64Matches.length; i++) {
          const dataUrl = base64Matches[i];
          try {
            const { url } = await uploadImageFromUrl(dataUrl, user.openId);
            base64UrlMap[dataUrl] = url;
            successCount++;
            sendEvent({ type: 'progress', current: i + 1, total: base64Matches.length });
            console.log(`[HTML File SSE] base64 ${i+1}/${base64Matches.length} → ${url}`);
          } catch (e) {
            console.warn(`[HTML File SSE] base64 upload failed (${i + 1}):`, e);
            failedFiles.push(`이미지 ${i + 1}`);
            sendEvent({ type: 'progress', current: i + 1, total: base64Matches.length, failed: true });
          }
        }
        for (const [dataUrl, storageUrl] of Object.entries(base64UrlMap)) {
          htmlContent = htmlContent.split(dataUrl).join(storageUrl);
        }
        sendEvent({ type: 'done', html: htmlContent, imageCount: successCount, failedFiles });
        res.end();
      } catch (err: unknown) {
        console.error('[HTML File SSE] Failed:', err);
        sendEvent({ type: 'error', error: err instanceof Error ? err.message : '변환 실패' });
        res.end();
      }
    }
  );

  // ─── 영상 업로드 엔드포인트 (200MB 제한) ────────────────────────────────────
  // mp4/webm/mov/avi/mkv 파일을 S3에 업로드하고 URL 반환
  app.post(
    '/api/upload/video',
    uploadVideo.single('file'),
    async (req: Request, res: Response) => {
      try {
        const user = await getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '로그인이 필요합니다.' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: '영상 파일이 없습니다.' });
          return;
        }
        const file = req.file;
        const decodedVideoName = decodeFilename(file.originalname);
        const ext = decodedVideoName.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'mp4';
        const safeName = toAsciiKey(decodedVideoName);
        const key = `uploads/videos/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}.${ext}`;
        const { url } = await storagePut(key, file.buffer, file.mimetype);
        console.log(`[Video Upload] ${decodedVideoName} (${(file.size / 1024 / 1024).toFixed(1)}MB) → ${url}`);
        res.json({ url, key, filename: decodedVideoName, size: file.size, mimetype: file.mimetype, ext });
      } catch (err: unknown) {
        console.error('[Video Upload] Failed:', err);
        const message = err instanceof Error ? err.message : '업로드 실패';
        res.status(500).json({ error: message });
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/download/* — 원본 파일명으로 다운로드하는 전용 REST API
// S3 presigned URL을 통해 서버가 직접 스트리밍하며 Content-Disposition 헤더 설정
// 이 방식은 Nginx 프록시 환경에서도 URL 파라미터 손실 없이 동작함
// ─────────────────────────────────────────────────────────────────────────────
export function registerDownloadRoute(app: Express): void {
  app.get("/api/download/*", async (req: Request, res: Response) => {
    // /api/download/ 이후 모든 경로가 fileKey
    const fileKey = (req.params as Record<string, string>)[0];
    if (!fileKey) {
      res.status(400).json({ error: "fileKey가 없습니다." });
      return;
    }

    try {
      // 1. DB에서 원본 파일명 조회 (가장 신뢰할 수 있는 방법)
      const originalFilename = await getOriginalFilename(fileKey);

      // 2. S3 presigned URL 획득
      const s3Resp = await storageFetch(fileKey);

      // 3. S3에서 파일 스트리밍
      if (!s3Resp.ok) {
        res.status(502).json({ error: "파일을 가져올 수 없습니다." });
        return;
      }

      // 4. 파일명 결정: DB 조회 결과 > fileKey에서 추출 (랜덤명 패턴 제거)
      const filename = originalFilename || (() => {
        const parts = fileKey.split("/");
        const raw = parts[parts.length - 1] || "download";
        // 타임스탬프_랜덤_-_해시.ext 패턴이면 "download.ext"로 대체
        const cleaned = raw.replace(/^\d+_[a-z0-9]+_-_[a-f0-9]+/, "download");
        return cleaned || raw;
      })();

      // 5. RFC 5987 방식으로 한글 파일명 인코딩
      const encodedFilename = encodeURIComponent(filename);
      const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_");

      // 6. 응답 헤더 설정
      const contentType = s3Resp.headers.get("content-type") || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`
      );
      const contentLength = s3Resp.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      res.setHeader("Cache-Control", "no-store");

      // 7. 스트리밍
      if (s3Resp.body) {
        const { Readable } = await import("stream");
        const nodeStream = Readable.fromWeb(s3Resp.body as import("stream/web").ReadableStream);
        nodeStream.pipe(res);
        nodeStream.on("error", (err) => {
          console.error("[Download] Stream error:", err);
          if (!res.headersSent) res.status(500).end();
        });
      } else {
        const buffer = Buffer.from(await s3Resp.arrayBuffer());
        res.end(buffer);
      }
    } catch (err: unknown) {
      console.error("[Download] Failed:", err);
      const message = err instanceof Error ? err.message : "다운로드 실패";
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });
}
