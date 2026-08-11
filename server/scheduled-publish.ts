/**
 * 예약 발행 자동 처리 스케줄러
 * - GET /api/scheduled/publish-scheduled : Heartbeat 크론에서 주기적으로 호출
 * - publishScheduledPosts()로 scheduledAt <= now AND status=draft 글을 자동 발행
 */
import type { Express, Request, Response } from "express";
import { publishScheduledPosts } from "./db";

export function registerScheduledPublishRoute(app: Express) {
  app.post("/api/scheduled/publish-scheduled", async (req: Request, res: Response) => {
    try {
      const count = await publishScheduledPosts();
      console.log(`[ScheduledPublish] ${count}개 글 자동 발행 완료`);
      res.json({ ok: true, published: count, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error("[ScheduledPublish] 오류:", err);
      res.status(500).json({ ok: false, error: "예약 발행 처리 중 오류가 발생했습니다." });
    }
  });
}
