/**
 * analytics.daily.test.ts
 * 일자별 페이지별 조회수 분석 함수 단위 테스트
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 모듈 mock
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "./db";
import {
  getDailyPageBreakdown,
  getDailyHourlyBreakdown,
  getDailyReferrerBreakdown,
  getRecentDailyTotals,
} from "./analytics";

const mockGetDb = vi.mocked(getDb);

describe("getDailyPageBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB가 없으면 빈 배열을 반환한다", async () => {
    mockGetDb.mockResolvedValue(null as any);
    const result = await getDailyPageBreakdown("2026-06-23");
    expect(result).toEqual([]);
  });

  it("DB가 있으면 페이지별 조회수 쿼리를 실행한다", async () => {
    const mockRows = [
      { path: "/p/test-post", views: 120, uniqueSessions: 80, avgDuration: 45 },
      { path: "/", views: 50, uniqueSessions: 40, avgDuration: 10 },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockRows),
    };
    mockGetDb.mockResolvedValue(mockQuery as any);

    const result = await getDailyPageBreakdown("2026-06-23", 30);
    expect(result).toEqual(mockRows);
    expect(mockQuery.limit).toHaveBeenCalledWith(30);
  });
});

describe("getDailyHourlyBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB가 없으면 빈 배열을 반환한다", async () => {
    mockGetDb.mockResolvedValue(null as any);
    const result = await getDailyHourlyBreakdown("2026-06-23");
    expect(result).toEqual([]);
  });

  it("DB가 있으면 시간대별 조회수 쿼리를 실행한다", async () => {
    const mockRows = [
      { hour: "09", views: 30 },
      { hour: "14", views: 55 },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRows),
    };
    mockGetDb.mockResolvedValue(mockQuery as any);

    const result = await getDailyHourlyBreakdown("2026-06-23");
    expect(result).toEqual(mockRows);
  });
});

describe("getDailyReferrerBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB가 없으면 빈 배열을 반환한다", async () => {
    mockGetDb.mockResolvedValue(null as any);
    const result = await getDailyReferrerBreakdown("2026-06-23");
    expect(result).toEqual([]);
  });

  it("DB가 있으면 유입 소스별 조회수 쿼리를 실행한다", async () => {
    const mockRows = [
      { referrerType: "search", views: 200 },
      { referrerType: "direct", views: 100 },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRows),
    };
    mockGetDb.mockResolvedValue(mockQuery as any);

    const result = await getDailyReferrerBreakdown("2026-06-23");
    expect(result).toEqual(mockRows);
  });
});

describe("getRecentDailyTotals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DB가 없으면 빈 배열을 반환한다", async () => {
    mockGetDb.mockResolvedValue(null as any);
    const result = await getRecentDailyTotals(30);
    expect(result).toEqual([]);
  });

  it("DB가 있으면 최근 N일 일별 합계 쿼리를 실행한다", async () => {
    const mockRows = [
      { date: "2026-06-22", views: 188 },
      { date: "2026-06-23", views: 639 },
      { date: "2026-06-24", views: 70 },
    ];
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockResolvedValue(mockRows),
    };
    mockGetDb.mockResolvedValue(mockQuery as any);

    const result = await getRecentDailyTotals(30);
    expect(result).toEqual(mockRows);
    expect(result).toHaveLength(3);
    // 6/23이 가장 높은 조회수
    const june23 = result.find(r => r.date === "2026-06-23");
    expect(june23?.views).toBe(639);
  });
});
