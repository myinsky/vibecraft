import { useState, useRef, useCallback } from "react";

export interface DownloadProgress {
  /** 다운로드 진행률 (0~100) */
  percent: number;
  /** 다운로드된 바이트 */
  loaded: number;
  /** 전체 파일 크기 (알 수 없으면 0) */
  total: number;
  /** 남은 시간 (초). 알 수 없으면 null */
  etaSeconds: number | null;
  /** 현재 다운로드 속도 (bytes/sec) */
  speedBps: number;
  /** 다운로드 상태 */
  status: "idle" | "downloading" | "done" | "error";
  /** 오류 메시지 */
  error: string | null;
}

/**
 * 파일 다운로드 진행률 + 남은 시간(ETA)을 표시하는 훅
 *
 * 사용법:
 * ```tsx
 * const { progress, download } = useDownloadWithProgress();
 * <button onClick={() => download(url, "filename.zip")}>다운로드</button>
 * {progress.status === "downloading" && (
 *   <span>{progress.percent}% - 남은 시간: {formatEta(progress.etaSeconds)}</span>
 * )}
 * ```
 */
export function useDownloadWithProgress() {
  const [progress, setProgress] = useState<DownloadProgress>({
    percent: 0,
    loaded: 0,
    total: 0,
    etaSeconds: null,
    speedBps: 0,
    status: "idle",
    error: null,
  });

  // 속도 계산을 위한 이전 시간/바이트 기록
  const startTimeRef = useRef<number>(0);
  const lastUpdateRef = useRef<{ time: number; loaded: number }>({ time: 0, loaded: 0 });

  const download = useCallback(async (url: string, filename?: string) => {
    setProgress({
      percent: 0,
      loaded: 0,
      total: 0,
      etaSeconds: null,
      speedBps: 0,
      status: "downloading",
      error: null,
    });

    startTimeRef.current = Date.now();
    lastUpdateRef.current = { time: Date.now(), loaded: 0 };

    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Content-Length 헤더에서 전체 크기 파악
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Content-Disposition 헤더에서 원본 파일명 추출 (서버가 설정한 경우 우선 사용)
      // RFC 5987: filename*=UTF-8''... 형식 우선, 없으면 filename="..." 폴백
      const resolvedFilename = extractFilenameFromHeaders(response.headers, filename, url);

      const reader = response.body?.getReader();
      if (!reader) {
        // ReadableStream 미지원 브라우저 폴백: 직접 blob 다운로드
        const blob = await response.blob();
        triggerBlobDownload(blob, resolvedFilename);
        setProgress(prev => ({ ...prev, percent: 100, status: "done" }));
        return;
      }

      const chunks: ArrayBuffer[] = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
        loaded += value.length;

        const now = Date.now();
        const elapsed = (now - startTimeRef.current) / 1000; // seconds

        // 속도 계산 (최근 1초 기준 이동 평균)
        const deltaTime = (now - lastUpdateRef.current.time) / 1000;
        const deltaLoaded = loaded - lastUpdateRef.current.loaded;
        const speedBps = deltaTime > 0 ? deltaLoaded / deltaTime : 0;

        // 매 500ms마다 lastUpdate 갱신 (너무 잦은 업데이트 방지)
        if (deltaTime >= 0.5) {
          lastUpdateRef.current = { time: now, loaded };
        }

        // 전체 속도 (시작부터 현재까지 평균)
        const avgSpeedBps = elapsed > 0 ? loaded / elapsed : 0;

        // ETA 계산
        let etaSeconds: number | null = null;
        if (total > 0 && avgSpeedBps > 0) {
          const remaining = total - loaded;
          etaSeconds = Math.max(0, remaining / avgSpeedBps);
        }

        const percent = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;

        setProgress({
          percent,
          loaded,
          total,
          etaSeconds,
          speedBps: Math.round(speedBps),
          status: "downloading",
          error: null,
        });
      }

      // 다운로드 완료 - blob 생성 및 트리거
      const blob = new Blob(chunks);
      triggerBlobDownload(blob, resolvedFilename);

      setProgress(prev => ({
        ...prev,
        percent: 100,
        loaded: prev.total || blob.size,
        total: prev.total || blob.size,
        etaSeconds: 0,
        status: "done",
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패";
      setProgress(prev => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setProgress({
      percent: 0,
      loaded: 0,
      total: 0,
      etaSeconds: null,
      speedBps: 0,
      status: "idle",
      error: null,
    });
  }, []);

  return { progress, download, reset };
}

/** Blob을 파일로 저장하는 트리거 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 메모리 해제 (약간의 딜레이 후)
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Content-Disposition 헤더에서 원본 파일명 추출
 * RFC 5987 filename*=UTF-8''... 형식 우선, 없으면 filename="..." 폴백
 * 둘 다 없으면 caller가 제공한 filename 또는 URL에서 추출
 */
function extractFilenameFromHeaders(headers: Headers, callerFilename: string | undefined, url: string): string {
  const disposition = headers.get('content-disposition');
  if (disposition) {
    // RFC 5987: filename*=UTF-8''encoded%20name 형식 우선
    const rfc5987Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
    if (rfc5987Match) {
      try {
        return decodeURIComponent(rfc5987Match[1]);
      } catch {
        // 디코딩 실패 시 다음 방법으로 폴백
      }
    }
    // filename="..." 또는 filename=... 형식
    const filenameMatch = disposition.match(/filename\s*=\s*["']?([^"';\n]+)["']?/i);
    if (filenameMatch) {
      const name = filenameMatch[1].trim();
      if (name) return name;
    }
  }
  // Content-Disposition이 없거나 파일명 추출 실패 시 caller 제공 파일명 또는 URL에서 추출
  return callerFilename || extractFilename(url);
}

/** URL에서 파일명 추출 */
function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "download");
  } catch {
    return "download";
  }
}

/**
 * ETA(남은 시간)를 사람이 읽기 쉬운 문자열로 변환
 * 예: 65 → "1분 5초", 3 → "3초", null → "계산 중..."
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null) return "계산 중...";
  if (seconds <= 0) return "거의 완료";
  if (seconds < 60) return `${Math.ceil(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (secs === 0) return `${mins}분`;
  return `${mins}분 ${secs}초`;
}

/**
 * 바이트를 사람이 읽기 쉬운 크기 문자열로 변환
 * 예: 1536 → "1.5 KB", 1048576 → "1.0 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(1)} ${units[i]}`;
}
