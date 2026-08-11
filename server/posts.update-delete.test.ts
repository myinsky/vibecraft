import { describe, it, expect, vi, beforeEach } from "vitest";

// DB 헬퍼 모킹
vi.mock("./db", () => ({
  getDb: vi.fn(),
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  getAllPosts: vi.fn().mockResolvedValue([]),
  getPostsByCategory: vi.fn().mockResolvedValue([]),
  getPostById: vi.fn(),
  incrementPostViews: vi.fn(),
  togglePostLike: vi.fn(),
  getAllVibeApps: vi.fn().mockResolvedValue([]),
  getVibeAppById: vi.fn(),
  incrementAppDownloads: vi.fn(),
  createAppReview: vi.fn(),
  getReviewsByAppId: vi.fn().mockResolvedValue([]),
  createApiKey: vi.fn(),
  getApiKeysByUser: vi.fn().mockResolvedValue([]),
  revokeApiKey: vi.fn(),
}));

import { updatePost, deletePost } from "./db";

describe("updatePost helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call updatePost with correct args", async () => {
    const mockUpdated = { id: 1, title: "Updated Title", content: "<p>Updated</p>", authorId: 42 };
    vi.mocked(updatePost).mockResolvedValue(mockUpdated as any);

    const result = await updatePost(1, 42, {
      title: "Updated Title",
      content: "<p>Updated</p>",
      category: "ai-apps",
    });

    expect(updatePost).toHaveBeenCalledWith(1, 42, {
      title: "Updated Title",
      content: "<p>Updated</p>",
      category: "ai-apps",
    });
    expect(result).toEqual(mockUpdated);
  });

  it("should reject if authorId does not match", async () => {
    vi.mocked(updatePost).mockRejectedValue(new Error("Forbidden"));

    await expect(
      updatePost(1, 99, { title: "Hacked", content: "<p>x</p>", category: "ai-apps" })
    ).rejects.toThrow("Forbidden");
  });
});

describe("deletePost helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call deletePost with correct args", async () => {
    vi.mocked(deletePost).mockResolvedValue({ success: true });

    const result = await deletePost(1, 42);

    expect(deletePost).toHaveBeenCalledWith(1, 42);
    expect(result).toEqual({ success: true });
  });

  it("should reject if post not found", async () => {
    vi.mocked(deletePost).mockRejectedValue(new Error("Post not found"));

    await expect(deletePost(999, 42)).rejects.toThrow("Post not found");
  });

  it("should reject if authorId does not match", async () => {
    vi.mocked(deletePost).mockRejectedValue(new Error("Forbidden"));

    await expect(deletePost(1, 99)).rejects.toThrow("Forbidden");
  });
});
