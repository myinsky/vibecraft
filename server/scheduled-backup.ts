/**
 * 자동 정기 백업 Heartbeat 핸들러
 * - 매일 자정(UTC 15:00 = KST 00:00)에 실행
 * - S3에 백업 저장, 최근 7개 유지
 * - /api/scheduled/auto-backup 에 POST 요청
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { saveBackupToS3 } from "./db";

export function registerScheduledBackupRoute(app: Express) {
  app.post("/api/scheduled/auto-backup", async (req: Request, res: Response) => {
    try {
      // 1. Heartbeat 인증
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }

      // 2. 백업 실행
      const result = await saveBackupToS3(true);

      console.log(`[auto-backup] 완료: ${result.fileKey} (${result.fileSize} bytes)`);
      return res.json({ ok: true, fileKey: result.fileKey, fileSize: result.fileSize });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[auto-backup] 오류:", err);
      return res.status(500).json({
        error,
        stack,
        context: { url: req.url, taskUid: "unknown" },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
