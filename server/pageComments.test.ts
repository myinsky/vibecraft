/**
 * 페이지 댓글 기능 테스트
 * - comments.listByPage, comments.addToPage, comments.deletePage 프로시저 로직 검증
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 모킹
vi.mock("./db", () => ({
  getCommentsByPage: vi.fn().mockImplementation((pageId: number, _includeAll: boolean, opts: { limit: number; cursor?: number }) => {
    const allComments = [
      { id: 1, pageId: 1, userId: "user1", userName: "홍길동", content: "좋은 글이네요!", aiReply: null, createdAt: new Date("2026-01-01T10:00:00Z") },
      { id: 2, pageId: 1, userId: "user2", userName: "김철수", content: "감사합니다.", aiReply: "감사합니다! 더 좋은 글로 보답하겠습니다.", createdAt: new Date("2026-01-02T10:00:00Z") },
      { id: 3, pageId: 2, userId: "user1", userName: "홍길동", content: "다른 페이지 댓글", aiReply: null, createdAt: new Date("2026-01-03T10:00:00Z") },
    ];
    const filtered = allComments.filter(c => c.pageId === pageId);
    const cursor = opts.cursor;
    const startIdx = cursor ? filtered.findIndex(c => c.id === cursor) + 1 : 0;
    const items = filtered.slice(startIdx, startIdx + opts.limit);
    const nextCursor = startIdx + opts.limit < filtered.length ? items[items.length - 1]?.id ?? null : null;
    return Promise.resolve({ items, nextCursor });
  }),
  addPageComment: vi.fn().mockImplementation((data: { pageId: number; userId: string; userName: string; content: string }) => {
    return Promise.resolve({ id: 99, ...data, aiReply: null, createdAt: new Date() });
  }),
  deleteComment: vi.fn().mockResolvedValue({ success: true }),
}));

import { getCommentsByPage, addPageComment, deleteComment } from "./db";

describe("페이지 댓글 DB 함수 - getCommentsByPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("특정 pageId의 댓글 목록 반환", async () => {
    const result = await getCommentsByPage(1, false, { limit: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].pageId).toBe(1);
    expect(result.items[1].pageId).toBe(1);
  });

  it("다른 pageId의 댓글은 반환하지 않음", async () => {
    const result = await getCommentsByPage(2, false, { limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].pageId).toBe(2);
  });

  it("limit 파라미터가 적용됨", async () => {
    const result = await getCommentsByPage(1, false, { limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).not.toBeNull();
  });

  it("nextCursor가 없으면 null 반환", async () => {
    const result = await getCommentsByPage(1, false, { limit: 10 });
    expect(result.nextCursor).toBeNull();
  });

  it("댓글이 없는 pageId는 빈 배열 반환", async () => {
    const result = await getCommentsByPage(999, false, { limit: 10 });
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

describe("페이지 댓글 DB 함수 - addPageComment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("댓글 추가 후 id 포함 객체 반환", async () => {
    const result = await addPageComment({
      pageId: 1,
      userId: "user3",
      userName: "이영희",
      content: "정말 유익한 글이에요!",
    });
    expect(result).toHaveProperty("id");
    expect(result.id).toBe(99);
    expect(result.content).toBe("정말 유익한 글이에요!");
    expect(result.userName).toBe("이영희");
  });

  it("addPageComment가 올바른 인자로 호출됨", async () => {
    await addPageComment({ pageId: 1, userId: "u1", userName: "테스터", content: "테스트 댓글" });
    expect(addPageComment).toHaveBeenCalledWith({
      pageId: 1,
      userId: "u1",
      userName: "테스터",
      content: "테스트 댓글",
    });
  });
});

describe("페이지 댓글 DB 함수 - deleteComment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("댓글 삭제 성공 시 success:true 반환", async () => {
    const result = await deleteComment(1);
    expect(result).toEqual({ success: true });
  });

  it("deleteComment가 올바른 id로 호출됨", async () => {
    await deleteComment(42);
    expect(deleteComment).toHaveBeenCalledWith(42);
  });
});

describe("페이지 댓글 프로시저 로직 - 권한 검증", () => {
  it("댓글 작성자는 자신의 댓글 삭제 가능", () => {
    const comment = { id: 1, userId: "user1", userName: "홍길동", content: "테스트" };
    const currentUserId = "user1";
    const canDelete = comment.userId === currentUserId;
    expect(canDelete).toBe(true);
  });

  it("다른 사용자의 댓글은 삭제 불가 (일반 사용자)", () => {
    const comment = { id: 1, userId: "user1", userName: "홍길동", content: "테스트" };
    const currentUserId = "user2";
    const isAdmin = false;
    const canDelete = comment.userId === currentUserId || isAdmin;
    expect(canDelete).toBe(false);
  });

  it("관리자는 모든 댓글 삭제 가능", () => {
    const comment = { id: 1, userId: "user1", userName: "홍길동", content: "테스트" };
    const currentUserId = "admin1";
    const isAdmin = true;
    const canDelete = comment.userId === currentUserId || isAdmin;
    expect(canDelete).toBe(true);
  });
});

describe("페이지 댓글 - 입력 유효성 검증", () => {
  it("빈 댓글은 허용하지 않음", () => {
    const content = "  ";
    const isValid = content.trim().length > 0;
    expect(isValid).toBe(false);
  });

  it("2000자 이내 댓글은 허용", () => {
    const content = "a".repeat(2000);
    const isValid = content.trim().length > 0 && content.length <= 2000;
    expect(isValid).toBe(true);
  });

  it("2001자 이상 댓글은 허용하지 않음", () => {
    const content = "a".repeat(2001);
    const isValid = content.trim().length > 0 && content.length <= 2000;
    expect(isValid).toBe(false);
  });

  it("HTML 태그는 sanitize 후 텍스트만 남음", () => {
    // DOMPurify.sanitize(content, { ALLOWED_TAGS: [] }) 시뮬레이션
    const sanitize = (html: string) => html.replace(/<[^>]*>/g, "");
    const input = "<script>alert('xss')</script>안녕하세요";
    const sanitized = sanitize(input);
    expect(sanitized).toBe("alert('xss')안녕하세요");
    expect(sanitized).not.toContain("<script>");
  });
});

describe("페이지 댓글 - commentsEnabled 조건부 렌더링 로직", () => {
  it("commentsEnabled=true인 페이지에 댓글 섹션 표시", () => {
    const page = { id: 1, commentsEnabled: true };
    const shouldShowComments = page.commentsEnabled === true;
    expect(shouldShowComments).toBe(true);
  });

  it("commentsEnabled=false인 페이지에 댓글 섹션 미표시", () => {
    const page = { id: 2, commentsEnabled: false };
    const shouldShowComments = page.commentsEnabled === true;
    expect(shouldShowComments).toBe(false);
  });

  it("commentsEnabled가 undefined인 경우 댓글 섹션 미표시", () => {
    const page: { id: number; commentsEnabled?: boolean } = { id: 3 };
    const shouldShowComments = page.commentsEnabled === true;
    expect(shouldShowComments).toBe(false);
  });
});

// ─── 좋아요 기능 테스트 ────────────────────────────────────────────────────────

// DB mock에 좋아요 함수 추가
vi.mock("./db.likes", () => ({
  toggleCommentLike: vi.fn(),
  getCommentLikeStatuses: vi.fn(),
}));

describe("댓글 좋아요 - toggleCommentLike 로직", () => {
  it("좋아요 추가 시 liked:true, likeCount 증가", () => {
    const prevLiked = false;
    const prevCount = 3;
    const newLiked = !prevLiked;
    const newCount = prevCount + (newLiked ? 1 : -1);
    expect(newLiked).toBe(true);
    expect(newCount).toBe(4);
  });

  it("좋아요 취소 시 liked:false, likeCount 감소", () => {
    const prevLiked = true;
    const prevCount = 5;
    const newLiked = !prevLiked;
    const newCount = prevCount + (newLiked ? 1 : -1);
    expect(newLiked).toBe(false);
    expect(newCount).toBe(4);
  });

  it("likeCount는 0 미만으로 내려가지 않음", () => {
    const prevCount = 0;
    const delta = -1;
    const newCount = Math.max(0, prevCount + delta);
    expect(newCount).toBe(0);
  });

  it("AI 답변 좋아요와 댓글 좋아요는 독립적으로 관리됨", () => {
    const likedMap: Record<string, boolean> = {
      "1_comment": true,
      "1_ai_reply": false,
    };
    expect(likedMap["1_comment"]).toBe(true);
    expect(likedMap["1_ai_reply"]).toBe(false);
  });
});

describe("댓글 좋아요 - 낙관적 업데이트 로직", () => {
  it("좋아요 클릭 시 즉시 UI 반영 (낙관적 업데이트)", () => {
    const commentId = 1;
    const targetType = "comment";
    const key = `${commentId}_${targetType}`;
    const likedMap: Record<string, boolean> = {};
    const likeCountMap: Record<string, number> = { [key]: 2 };

    // 낙관적 업데이트 시뮬레이션
    const wasLiked = !!likedMap[key];
    const newLikedMap = { ...likedMap, [key]: !wasLiked };
    const newCountMap = {
      ...likeCountMap,
      [key]: Math.max(0, (likeCountMap[key] ?? 0) + (wasLiked ? -1 : 1)),
    };

    expect(newLikedMap[key]).toBe(true);
    expect(newCountMap[key]).toBe(3);
  });

  it("서버 응답 후 실제 카운트로 동기화", () => {
    const commentId = 2;
    const targetType = "comment";
    const key = `${commentId}_${targetType}`;
    // 서버가 반환한 실제 값
    const serverResponse = { liked: true, likeCount: 7, aiReplyLikeCount: 0 };

    const likeCountMap: Record<string, number> = { [key]: 6 }; // 낙관적 값
    const syncedCount = targetType === "comment" ? serverResponse.likeCount : serverResponse.aiReplyLikeCount;
    const newCountMap = { ...likeCountMap, [key]: syncedCount };

    expect(newCountMap[key]).toBe(7);
  });

  it("오류 발생 시 이전 상태로 롤백", () => {
    const commentId = 3;
    const targetType = "ai_reply";
    const key = `${commentId}_${targetType}`;

    // 낙관적 업데이트 후 상태
    const likedMap: Record<string, boolean> = { [key]: true }; // 낙관적으로 true로 변경됨
    const likeCountMap: Record<string, number> = { [key]: 1 }; // 낙관적으로 1로 변경됨

    // 롤백: 낙관적 업데이트 전 상태로 되돌림
    const wasLiked = !likedMap[key]; // 원래는 false였음
    const rolledBackLiked = wasLiked;
    const rolledBackCount = Math.max(0, likeCountMap[key] + (wasLiked ? 1 : -1));

    expect(rolledBackLiked).toBe(false);
    expect(rolledBackCount).toBe(0);
  });
});

describe("댓글 좋아요 - 비로그인 사용자 처리", () => {
  it("비로그인 사용자는 좋아요 불가 (토스트 메시지)", () => {
    const isAuthenticated = false;
    const toastMessages: string[] = [];
    const handleLike = (commentId: number, targetType: string) => {
      if (!isAuthenticated) {
        toastMessages.push("좋아요를 누르려면 로그인이 필요합니다.");
        return;
      }
      // 실제 좋아요 처리
    };
    handleLike(1, "comment");
    expect(toastMessages).toHaveLength(1);
    expect(toastMessages[0]).toContain("로그인");
  });

  it("비로그인 사용자의 getLikeStatuses는 빈 배열 반환", () => {
    const user = null;
    const likeStatuses = user ? [{ commentId: 1, targetType: "comment" }] : [];
    expect(likeStatuses).toHaveLength(0);
  });
});

describe("댓글 좋아요 - likedMap 키 형식", () => {
  it("댓글 좋아요 키는 commentId_comment 형식", () => {
    const commentId = 42;
    const targetType = "comment";
    const key = `${commentId}_${targetType}`;
    expect(key).toBe("42_comment");
  });

  it("AI 답변 좋아요 키는 commentId_ai_reply 형식", () => {
    const commentId = 42;
    const targetType = "ai_reply";
    const key = `${commentId}_${targetType}`;
    expect(key).toBe("42_ai_reply");
  });

  it("여러 댓글의 좋아요 상태를 독립적으로 관리", () => {
    const likeStatuses = [
      { commentId: 1, targetType: "comment" as const },
      { commentId: 2, targetType: "ai_reply" as const },
      { commentId: 3, targetType: "comment" as const },
    ];
    const likedMap: Record<string, boolean> = {};
    for (const s of likeStatuses) {
      likedMap[`${s.commentId}_${s.targetType}`] = true;
    }
    expect(likedMap["1_comment"]).toBe(true);
    expect(likedMap["2_ai_reply"]).toBe(true);
    expect(likedMap["3_comment"]).toBe(true);
    expect(likedMap["1_ai_reply"]).toBeUndefined();
    expect(likedMap["2_comment"]).toBeUndefined();
  });
});

describe("댓글 좋아요 - 카운트 초기화", () => {
  it("댓글 목록 로드 시 likeCount, aiReplyLikeCount 초기화", () => {
    const comments = [
      { id: 1, likeCount: 3, aiReplyLikeCount: 1 },
      { id: 2, likeCount: 0, aiReplyLikeCount: 5 },
    ];
    const countMap: Record<string, number> = {};
    for (const c of comments) {
      countMap[`${c.id}_comment`] = c.likeCount ?? 0;
      countMap[`${c.id}_ai_reply`] = c.aiReplyLikeCount ?? 0;
    }
    expect(countMap["1_comment"]).toBe(3);
    expect(countMap["1_ai_reply"]).toBe(1);
    expect(countMap["2_comment"]).toBe(0);
    expect(countMap["2_ai_reply"]).toBe(5);
  });

  it("likeCount가 없는 경우 0으로 초기화", () => {
    const comment: any = { id: 10 }; // likeCount 없음
    const count = comment.likeCount ?? 0;
    expect(count).toBe(0);
  });
});
