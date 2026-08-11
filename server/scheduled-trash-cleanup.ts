/**
 * 보관함 자동 정리 스케줄러
 * - POST /api/scheduled/trash-cleanup : Heartbeat 크론에서 매일 1회 호출
 * - 보관함에 30일 이상 보관된 글을 완전 삭제합니다.
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { purgeExpiredTrashPosts } from "./db";

export function registerScheduledTrashCleanupRoute(app: Express) {
  app.post("/api/scheduled/trash-cleanup", async (req: Request, res: Response) => {
    try {
      // Heartbeat 인증 확인
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }

      const { deletedCount } = await purgeExpiredTrashPosts(30);
      console.log(`[TrashCleanup] 보관함 자동 정리 완료: ${deletedCount}개 완전 삭제`);
      res.json({ ok: true, deletedCount, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[TrashCleanup] 오류:", err);
      res.status(500).json({
        error: String(err),
        stack: err instanceof Error ? err.stack : undefined,
        context: { url: req.url },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
