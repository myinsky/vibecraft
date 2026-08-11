/**
 * 관리자 네비게이션 카테고리 추가/수정 테스트
 * - admin.createNavItem: 새 카테고리 추가
 * - admin.updateNavItems: 기존 카테고리 수정/저장
 * - admin.getNavItems: 카테고리 목록 조회
 * - admin.deleteNavItem: 카테고리 삭제
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
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
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createGuestContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("admin.getNavItems", () => {
  it("비로그인 사용자도 네비게이션 목록을 조회할 수 있어야 한다 (publicProcedure)", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    // publicProcedure이므로 에러 없이 배열 반환
    const result = await caller.admin.getNavItems();
    expect(Array.isArray(result)).toBe(true);
  });

  it("관리자도 네비게이션 목록을 조회할 수 있어야 한다", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.admin.getNavItems();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("admin.createNavItem - 권한 검사", () => {
  it("비로그인 사용자가 카테고리 추가 시 UNAUTHORIZED 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    await expect(
      caller.admin.createNavItem({
        label: "테스트 카테고리",
        path: "/test",
        sortOrder: 99,
        visible: true,
        showOnHome: true,
        sectionStyle: "grid",
        description: "테스트",
      })
    ).rejects.toThrow();
  });

  it("일반 사용자가 카테고리 추가 시 FORBIDDEN 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.createNavItem({
        label: "테스트 카테고리",
        path: "/test",
        sortOrder: 99,
        visible: true,
        showOnHome: true,
        sectionStyle: "grid",
        description: "테스트",
      })
    ).rejects.toThrow();
  });
});

describe("admin.updateNavItems - 권한 검사", () => {
  it("비로그인 사용자가 카테고리 수정 시 UNAUTHORIZED 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    await expect(
      caller.admin.updateNavItems([
        {
          id: 1,
          label: "수정된 카테고리",
          path: "/modified",
          sortOrder: 1,
          visible: true,
          showOnHome: true,
          sectionStyle: "grid",
          description: "수정",
        },
      ])
    ).rejects.toThrow();
  });

  it("일반 사용자가 카테고리 수정 시 FORBIDDEN 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.updateNavItems([
        {
          id: 1,
          label: "수정된 카테고리",
          path: "/modified",
          sortOrder: 1,
          visible: true,
          showOnHome: true,
          sectionStyle: "grid",
          description: "수정",
        },
      ])
    ).rejects.toThrow();
  });
});

describe("admin.deleteNavItem - 권한 검사", () => {
  it("비로그인 사용자가 카테고리 삭제 시 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createGuestContext());
    await expect(
      caller.admin.deleteNavItem({ id: 9999 })
    ).rejects.toThrow();
  });

  it("일반 사용자가 카테고리 삭제 시 에러가 발생해야 한다", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.admin.deleteNavItem({ id: 9999 })
    ).rejects.toThrow();
  });
});
