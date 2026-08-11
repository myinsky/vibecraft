import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// db 모듈 mock
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    deleteAllDrafts: vi.fn(),
  };
});

// cache 모듈 mock
vi.mock("./cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cache")>();
  return {
    ...actual,
    purgeAllCaches: vi.fn(),
  };
});

import { appRouter } from "./routers";
import { deleteAllDrafts } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("admin.deleteAllDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("관리자는 임시저장 전체 삭제 성공", async () => {
    vi.mocked(deleteAllDrafts).mockResolvedValue({ success: true, count: 5 });

    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.deleteAllDrafts();

    expect(result).toEqual({ success: true, count: 5 });
    expect(deleteAllDrafts).toHaveBeenCalledOnce();
  });

  it("임시저장이 없을 때 count 0 반환", async () => {
    vi.mocked(deleteAllDrafts).mockResolvedValue({ success: true, count: 0 });

    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.admin.deleteAllDrafts();

    expect(result).toEqual({ success: true, count: 0 });
  });

  it("일반 사용자는 FORBIDDEN 오류 발생", async () => {
    const ctx = createUserContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.admin.deleteAllDrafts()).rejects.toThrow(TRPCError);
    await expect(caller.admin.deleteAllDrafts()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(deleteAllDrafts).not.toHaveBeenCalled();
  });
});
