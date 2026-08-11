import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2";
import { eq as eqTop } from "drizzle-orm";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { cache, TTL } from './cache';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
// TiDB Serverless 무료 플랜 최대 동시 연결 5개 제한 → connectionLimit=3으로 설정하여 여유분 확보
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 5,       // TiDB Serverless 연결 최대 5개 허용
        waitForConnections: true, // 연결 대기 (타임아웃 없이)
        queueLimit: 0,            // 대기 큐 무제한
        connectTimeout: 10000,    // 연결 타임아웃 10초
        enableKeepAlive: true,    // TCP keep-alive: TiDB Serverless 연결 유지 (슬립 방지)
        keepAliveInitialDelay: 30000, // 30초 후 keep-alive 시작
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    // 이메일 1개당 1계정 제한: 동일 이메일로 다른 openId가 존재하면 기존 계정의 openId를 새 것으로 업데이트
    if (user.email) {
      const existingByEmail = await db
        .select({ id: users.id, openId: users.openId })
        .from(users)
        .where(eqTop(users.email, user.email))
        .limit(1);
      if (existingByEmail.length > 0 && existingByEmail[0].openId !== user.openId) {
        // 기존 계정에 새 openId 연결 (계정 통합)
        await db
          .update(users)
          .set({ openId: user.openId, lastSignedIn: new Date() })
          .where(eqTop(users.id, existingByEmail[0].id));
        console.log(`[Auth] 이메일 중복 감지: 기존 계정(openId: ${existingByEmail[0].openId})에 새 openId(${user.openId}) 연결`);
        return;
      }
    }

    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
      values.isOwner = true;
      updateSet.isOwner = true;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eqTop(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

// ─── 게시물 쿼리 ──────────────────────────────────────────────

import { and, count, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import {
  posts, InsertPost,
  vibeApps as vibeAppsTable, InsertVibeApp,
  appReviews, InsertAppReview,
  postLikes,
  slugHistory,
} from "../drizzle/schema";
// users는 상단 import에서 이미 가져옴

/**
 * 한글/영문 제목을 URL 슬러그로 변환
 * 예: "바이브 코딩 입문 가이드" → "바이브-코딩-입문-가이드-20260510"
 */
export function generateSlug(title: string, date?: Date): string {
  const d = date ?? new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")       // 공백/언더스코어 → 하이픈
    .replace(/[^\w\u3131-\u314e\u314f-\u3163\uac00-\ud7a3-]/g, "") // 한글·영숫자·하이픈만 허용
    .replace(/-+/g, "-")           // 연속 하이픈 정리
    .replace(/^-|-$/g, "")         // 앞뒤 하이픈 제거
    .slice(0, 200);                // 최대 200자
  return slug ? `${slug}-${dateStr}` : `post-${dateStr}`;
}

export async function createPost(data: InsertPost): Promise<{ id: number; slug: string; customSlug: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // slug 자동 생성 (제목 기반)
  const slugBase = generateSlug(data.title);
  // 중복 방지: 같은 slug가 있으면 뒤에 랜덤 4자리 추가
  const existing = await db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slugBase)).limit(1);
  const slug = existing.length > 0 ? `${slugBase}-${Math.random().toString(36).slice(2, 6)}` : slugBase;
  // customSlug 중복 방지: 같은 customSlug가 있으면 null로 저장
  let finalCustomSlug = (data as any).customSlug || null;
  if (finalCustomSlug) {
    const existingCustom = await db.select({ id: posts.id }).from(posts).where(eq(posts.customSlug, finalCustomSlug)).limit(1);
    if (existingCustom.length > 0) finalCustomSlug = null; // 중복이면 무시
  }
  const [result] = await db.insert(posts).values({ ...data, slug, customSlug: finalCustomSlug });
  // 게시물 목록 캐시 무효화
  cache.invalidate('posts:');
  return { id: (result as any).insertId as number, slug, customSlug: finalCustomSlug };
}

export async function getPostsByCategory(category: string, limit?: number) {
  const cacheKey = `posts:cat-nopaged:${category}:${limit ?? 'all'}`;
  return cache.get(cacheKey, async () => {
    const db = await getDb();
    if (!db) return [];
    const { isNull } = await import("drizzle-orm");
    const query = db
      .select()
      .from(posts)
      .where(and(eq(posts.category, category as any), eq(posts.published, true), isNull(posts.deletedAt)))
      .orderBy(desc(posts.createdAt));
    if (limit && limit > 0) return query.limit(limit);
    return query;
  }, TTL.SHORT);
}

export async function getAllPosts() {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  return db.select().from(posts).where(and(eq(posts.published, true), isNull(posts.deletedAt))).orderBy(desc(posts.createdAt));
}

export async function getPostsByCategoryPaged(category: string, page: number, limit: number, sortMode: 'latest' | 'popular' = 'latest') {
  const cacheKey = `posts:cat:${category}:${page}:${limit}:${sortMode}`;
  return cache.get(cacheKey, async () => {
    const db = await getDb();
    if (!db) return { posts: [], total: 0, page, limit };
    const { isNull } = await import("drizzle-orm");
    const offset = (page - 1) * limit;
    const orderBy = sortMode === 'popular'
      ? [desc(posts.views)]
      : [desc(posts.isPinned), desc(posts.createdAt)];
    const [rows, totalRows] = await Promise.all([
      db.select().from(posts)
        .where(and(eq(posts.category, category as any), eq(posts.published, true), isNull(posts.deletedAt), eq(posts.showInSection, true)))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(posts)
        .where(and(eq(posts.category, category as any), eq(posts.published, true), isNull(posts.deletedAt), eq(posts.showInSection, true))),
    ]);
    return { posts: rows, total: totalRows[0]?.count ?? 0, page, limit };
  }, TTL.MEDIUM);
}

export async function getAllPostsPaged(page: number, limit: number, sortMode: 'latest' | 'popular' = 'latest') {
  const cacheKey = `posts:all:${page}:${limit}:${sortMode}`;
  return cache.get(cacheKey, async () => {
    const db = await getDb();
    if (!db) return { posts: [], total: 0, page, limit };
    const { isNull } = await import("drizzle-orm");
    const offset = (page - 1) * limit;
    const orderBy = sortMode === 'popular' ? [desc(posts.views)] : [desc(posts.createdAt)];
    const [rows, totalRows] = await Promise.all([
      db.select().from(posts).where(and(eq(posts.published, true), isNull(posts.deletedAt), eq(posts.showInSection, true))).orderBy(...orderBy).limit(limit).offset(offset),
      db.select({ count: count() }).from(posts).where(and(eq(posts.published, true), isNull(posts.deletedAt), eq(posts.showInSection, true))),
    ]);
    return { posts: rows, total: totalRows[0]?.count ?? 0, page, limit };
  }, TTL.MEDIUM);
}

export async function searchPosts(query: string, page: number, limit: number) {
  const db = await getDb();
  if (!db) return { posts: [], total: 0, page, limit };
  const { isNull, like } = await import("drizzle-orm");
  const offset = (page - 1) * limit;
  const q = `%${query}%`;
  const whereClause = and(
    eq(posts.published, true),
    isNull(posts.deletedAt),
    or(
      like(posts.title, q),
      like(posts.excerpt, q),
    )
  );
  const [rows, totalRows] = await Promise.all([
    db.select({
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      thumbnail: posts.thumbnail,
      category: posts.category,
      tag: posts.tag,
      views: posts.views,
      likes: posts.likes,
      createdAt: posts.createdAt,
      slug: posts.slug,
      customSlug: posts.customSlug,
    }).from(posts)
      .where(whereClause)
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(posts).where(whereClause),
  ]);
  return { posts: rows, total: totalRows[0]?.count ?? 0, page, limit };
}

export async function getPostById(id: number) {
  return cache.get(`post:id:${id}`, async () => {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        excerpt: posts.excerpt,
        content: posts.content,
        thumbnail: posts.thumbnail,
        category: posts.category,
        tag: posts.tag,
        badge: posts.badge,
        authorId: posts.authorId,
        authorName: users.name,
        views: posts.views,
        likes: posts.likes,
        published: posts.published,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        isPinned: posts.isPinned,
        pinnedAt: posts.pinnedAt,
        slug: posts.slug,
        isHtmlSource: posts.isHtmlSource,
        isAppMode: posts.isAppMode,
        appEmbedUrl: posts.appEmbedUrl,
        embedWidth: posts.embedWidth,
        showInSection: posts.showInSection,
        allowComments: posts.allowComments,
        disableAds: posts.disableAds,
        coupangKeywords: posts.coupangKeywords,
        enableToc: posts.enableToc,
        customSlug: posts.customSlug,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, id))
      .limit(1);
    return result[0];
  }, TTL.SHORT);
}

export async function getPostBySlug(slug: string) {
  return cache.get(`post:slug:${slug}`, async () => {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        excerpt: posts.excerpt,
        content: posts.content,
        thumbnail: posts.thumbnail,
        category: posts.category,
        tag: posts.tag,
        badge: posts.badge,
        authorId: posts.authorId,
        authorName: users.name,
        views: posts.views,
        likes: posts.likes,
        published: posts.published,
        status: posts.status,
        scheduledAt: posts.scheduledAt,
        isPinned: posts.isPinned,
        pinnedAt: posts.pinnedAt,
        slug: posts.slug,
        isHtmlSource: posts.isHtmlSource,
        isAppMode: posts.isAppMode,
        appEmbedUrl: posts.appEmbedUrl,
        embedWidth: posts.embedWidth,
        showInSection: posts.showInSection,
        allowComments: posts.allowComments,
        disableAds: posts.disableAds,
        coupangKeywords: posts.coupangKeywords,
        enableToc: posts.enableToc,
        customSlug: posts.customSlug,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(or(eq(posts.slug, slug), eq(posts.customSlug, slug)))
      .limit(1);
    return result[0];
  }, TTL.SHORT);
}

/**
 * customSlug만으로 게시물 조회 (중복 체크 전용)
 * getPostBySlug와 달리 slug 컬럼은 검색하지 않음
 */
export async function getPostByCustomSlugOnly(customSlug: string, excludeId?: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { isNull } = await import('drizzle-orm');
  const conditions = excludeId
    ? and(eq(posts.customSlug, customSlug), ne(posts.id, excludeId), isNull(posts.deletedAt))
    : and(eq(posts.customSlug, customSlug), isNull(posts.deletedAt));
  const result = await db
    .select({ id: posts.id, title: posts.title, slug: posts.slug, customSlug: posts.customSlug })
    .from(posts)
    .where(conditions)
    .limit(1);
  return result[0];
}

/**
 * 관련 게시물 조회
 * 1순위: 같은 카테고리, 현재 글 제외, 최신순 최대 4개
 * 2순위: 같은 카테고리가 부족하면 다른 카테고리 인기글(조회수 순)로 보완
 */
export async function getRelatedPosts(postId: number, category: string, limit = 4) {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");

  // 1단계: 같은 카테고리 글 (현재 글 제외, 최신순)
  const sameCat = await db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      thumbnail: posts.thumbnail,
      category: posts.category,
      slug: posts.slug,
      views: posts.views,
      likes: posts.likes,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.category, category as any),
        ne(posts.id, postId),
        eq(posts.published, true),
        isNull(posts.deletedAt),
      )
    )
    .orderBy(desc(posts.createdAt))
    .limit(limit);

  if (sameCat.length >= limit) return sameCat;

  // 2단계: 부족한 수만큼 다른 카테고리 인기글(조회수 순)로 보완
  const needed = limit - sameCat.length;
  const sameCatIds = sameCat.map((p) => p.id);
  const exclude = [postId, ...sameCatIds];

  const fallback = await db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      thumbnail: posts.thumbnail,
      category: posts.category,
      slug: posts.slug,
      views: posts.views,
      likes: posts.likes,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(
      and(
        eq(posts.published, true),
        isNull(posts.deletedAt),
        sql`${posts.id} NOT IN (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})`
      )
    )
    .orderBy(desc(posts.views))
    .limit(needed);

  return [...sameCat, ...fallback];
}

export async function incrementPostViews(id: number) {
  const db = await getDb();
  if (!db) return;
  const post = await getPostById(id);
  if (!post) return;
  await db.update(posts).set({ views: post.views + 1 }).where(eq(posts.id, id));
}

export async function getPostLikeStatus(postId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const existing = await db
    .select({ id: postLikes.id })
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .limit(1);
  return existing.length > 0;
}

export async function togglePostLike(postId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await db
    .select()
    .from(postLikes)
    .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
    .limit(1);
  const post = await getPostById(postId);
  if (!post) throw new Error("Post not found");
  if (existing.length > 0) {
    await db.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
    await db.update(posts).set({ likes: Math.max(0, post.likes - 1) }).where(eq(posts.id, postId));
    return { liked: false };
  } else {
    await db.insert(postLikes).values({ postId, userId });
    await db.update(posts).set({ likes: post.likes + 1 }).where(eq(posts.id, postId));
    return { liked: true };
  }
}

// ─── 바이브 앱 쿼리 ────────────────────────────────────────────

export async function createVibeApp(data: InsertVibeApp) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(vibeAppsTable).values(data);
  return result;
}

export async function getAllVibeApps() {
  return cache.get('vibeApps:all', async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: vibeAppsTable.id,
        name: vibeAppsTable.name,
        description: vibeAppsTable.description,
        longDescription: vibeAppsTable.longDescription,
        category: vibeAppsTable.category,
        techStack: vibeAppsTable.techStack,
        features: vibeAppsTable.features,
        howToUse: vibeAppsTable.howToUse,
        appUrl: vibeAppsTable.appUrl,
        downloadUrl: vibeAppsTable.downloadUrl,
        originalFilename: vibeAppsTable.originalFilename,
        thumbnail: vibeAppsTable.thumbnail,
        gradient: vibeAppsTable.gradient,
        downloads: vibeAppsTable.downloads,
        ratingSum: vibeAppsTable.ratingSum,
        ratingCount: vibeAppsTable.ratingCount,
        likeCount: vibeAppsTable.likeCount,
        viewCount: vibeAppsTable.viewCount,
        authorId: vibeAppsTable.authorId,
        published: vibeAppsTable.published,
        submissionStatus: vibeAppsTable.submissionStatus,
        submittedBy: vibeAppsTable.submittedBy,
        rejectionReason: vibeAppsTable.rejectionReason,
        pcDownloadUrl: vibeAppsTable.pcDownloadUrl,
        pcOriginalFilename: vibeAppsTable.pcOriginalFilename,
        mobileDownloadUrl: vibeAppsTable.mobileDownloadUrl,
        mobileOriginalFilename: vibeAppsTable.mobileOriginalFilename,
        createdAt: vibeAppsTable.createdAt,
        updatedAt: vibeAppsTable.updatedAt,
        // 개발자 정보 (users JOIN)
        authorUsername: users.username,
        authorName: users.name,
        authorProfileImage: users.profileImage,
      })
      .from(vibeAppsTable)
      .leftJoin(users, eq(vibeAppsTable.authorId, users.id))
      .where(eq(vibeAppsTable.published, true))
      .orderBy(desc(vibeAppsTable.createdAt));
    return rows;
  }, TTL.MEDIUM);
}

export async function getVibeAppById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: vibeAppsTable.id,
      name: vibeAppsTable.name,
      description: vibeAppsTable.description,
      longDescription: vibeAppsTable.longDescription,
      category: vibeAppsTable.category,
      techStack: vibeAppsTable.techStack,
      features: vibeAppsTable.features,
      howToUse: vibeAppsTable.howToUse,
      appUrl: vibeAppsTable.appUrl,
      downloadUrl: vibeAppsTable.downloadUrl,
      originalFilename: vibeAppsTable.originalFilename,
      thumbnail: vibeAppsTable.thumbnail,
      gradient: vibeAppsTable.gradient,
      downloads: vibeAppsTable.downloads,
      ratingSum: vibeAppsTable.ratingSum,
      ratingCount: vibeAppsTable.ratingCount,
      likeCount: vibeAppsTable.likeCount,
      viewCount: vibeAppsTable.viewCount,
      authorId: vibeAppsTable.authorId,
      published: vibeAppsTable.published,
      submissionStatus: vibeAppsTable.submissionStatus,
      submittedBy: vibeAppsTable.submittedBy,
      rejectionReason: vibeAppsTable.rejectionReason,
      pcDownloadUrl: vibeAppsTable.pcDownloadUrl,
      pcOriginalFilename: vibeAppsTable.pcOriginalFilename,
      mobileDownloadUrl: vibeAppsTable.mobileDownloadUrl,
      mobileOriginalFilename: vibeAppsTable.mobileOriginalFilename,
      createdAt: vibeAppsTable.createdAt,
      updatedAt: vibeAppsTable.updatedAt,
      authorUsername: users.username,
      authorName: users.name,
      authorProfileImage: users.profileImage,
    })
    .from(vibeAppsTable)
    .leftJoin(users, eq(vibeAppsTable.authorId, users.id))
    .where(eq(vibeAppsTable.id, id))
    .limit(1);
  return result[0];
}

export async function updateVibeApp(id: number, data: Partial<InsertVibeApp>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(vibeAppsTable).set(data).where(eq(vibeAppsTable.id, id));
  cache.invalidate('vibeApps:all');
}

export async function deleteVibeApp(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(vibeAppsTable).where(eq(vibeAppsTable.id, id));
  cache.invalidate('vibeApps:all');
}

export async function getAllVibeAppsAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: vibeAppsTable.id,
      name: vibeAppsTable.name,
      description: vibeAppsTable.description,
      longDescription: vibeAppsTable.longDescription,
      category: vibeAppsTable.category,
      techStack: vibeAppsTable.techStack,
      features: vibeAppsTable.features,
      howToUse: vibeAppsTable.howToUse,
      appUrl: vibeAppsTable.appUrl,
      downloadUrl: vibeAppsTable.downloadUrl,
      originalFilename: vibeAppsTable.originalFilename,
      thumbnail: vibeAppsTable.thumbnail,
      gradient: vibeAppsTable.gradient,
      downloads: vibeAppsTable.downloads,
      ratingSum: vibeAppsTable.ratingSum,
      ratingCount: vibeAppsTable.ratingCount,
      likeCount: vibeAppsTable.likeCount,
      viewCount: vibeAppsTable.viewCount,
      authorId: vibeAppsTable.authorId,
      published: vibeAppsTable.published,
      submissionStatus: vibeAppsTable.submissionStatus,
      submittedBy: vibeAppsTable.submittedBy,
      rejectionReason: vibeAppsTable.rejectionReason,
      pcDownloadUrl: vibeAppsTable.pcDownloadUrl,
      pcOriginalFilename: vibeAppsTable.pcOriginalFilename,
      mobileDownloadUrl: vibeAppsTable.mobileDownloadUrl,
      mobileOriginalFilename: vibeAppsTable.mobileOriginalFilename,
      createdAt: vibeAppsTable.createdAt,
      updatedAt: vibeAppsTable.updatedAt,
      authorUsername: users.username,
      authorName: users.name,
      authorProfileImage: users.profileImage,
    })
    .from(vibeAppsTable)
    .leftJoin(users, eq(vibeAppsTable.authorId, users.id))
    .orderBy(desc(vibeAppsTable.createdAt));
}

/** 일반 사용자가 앱 등록 신청 */
export async function createVibeAppSubmission(data: InsertVibeApp & { submittedBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(vibeAppsTable).values({
    ...data,
    submissionStatus: 'pending',
    published: false, // 승인 전에는 공개하지 않음
  });
  return result;
}

/** 검토중 신청 목록 조회 */
export async function listPendingSubmissions() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: vibeAppsTable.id,
      name: vibeAppsTable.name,
      description: vibeAppsTable.description,
      longDescription: vibeAppsTable.longDescription,
      category: vibeAppsTable.category,
      techStack: vibeAppsTable.techStack,
      features: vibeAppsTable.features,
      howToUse: vibeAppsTable.howToUse,
      appUrl: vibeAppsTable.appUrl,
      thumbnail: vibeAppsTable.thumbnail,
      pcDownloadUrl: vibeAppsTable.pcDownloadUrl,
      pcOriginalFilename: vibeAppsTable.pcOriginalFilename,
      mobileDownloadUrl: vibeAppsTable.mobileDownloadUrl,
      mobileOriginalFilename: vibeAppsTable.mobileOriginalFilename,
      submissionStatus: vibeAppsTable.submissionStatus,
      submittedBy: vibeAppsTable.submittedBy,
      rejectionReason: vibeAppsTable.rejectionReason,
      createdAt: vibeAppsTable.createdAt,
      submitterName: users.name,
    })
    .from(vibeAppsTable)
    .leftJoin(users, eq(vibeAppsTable.submittedBy, users.id))
    .where(eq(vibeAppsTable.submissionStatus, 'pending'))
    .orderBy(desc(vibeAppsTable.createdAt));
}

/** 신청 승인: published=true, submissionStatus='approved' */
export async function approveSubmission(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(vibeAppsTable)
    .set({ submissionStatus: 'approved', published: true })
    .where(eq(vibeAppsTable.id, id));
  cache.invalidate('vibeApps:all');
}

/** 신청 거절: submissionStatus='rejected', rejectionReason 저장 */
export async function rejectSubmission(id: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(vibeAppsTable)
    .set({ submissionStatus: 'rejected', rejectionReason: reason })
    .where(eq(vibeAppsTable.id, id));
}

/** 내가 신청한 앱 목록 조회 */
export async function getMySubmissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vibeAppsTable)
    .where(eq(vibeAppsTable.submittedBy, userId))
    .orderBy(desc(vibeAppsTable.createdAt));
}

export async function incrementAppDownloads(id: number) {
  const db = await getDb();
  if (!db) return;
  const app = await getVibeAppById(id);
  if (!app) return;
  await db.update(vibeAppsTable).set({ downloads: app.downloads + 1 }).where(eq(vibeAppsTable.id, id));
}

// ─── 앱 리뷰 쿼리 ──────────────────────────────────────────────

export async function createAppReview(data: InsertAppReview) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(appReviews).values(data);
  const app = await getVibeAppById(data.appId);
  if (app) {
    await db
      .update(vibeAppsTable)
      .set({ ratingSum: app.ratingSum + data.rating, ratingCount: app.ratingCount + 1 })
      .where(eq(vibeAppsTable.id, data.appId));
  }
}

export async function getReviewsByAppId(appId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: appReviews.id,
      appId: appReviews.appId,
      userId: appReviews.userId,
      rating: appReviews.rating,
      content: appReviews.content,
      createdAt: appReviews.createdAt,
      userName: users.name,
    })
    .from(appReviews)
    .leftJoin(users, eq(appReviews.userId, users.id))
    .where(eq(appReviews.appId, appId))
    .orderBy(desc(appReviews.createdAt));
}

// ─── API 키 쿼리 ───────────────────────────────────────────────

import crypto from "crypto";
import { apiKeys, InsertApiKey } from "../drizzle/schema";

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = "sag_" + crypto.randomBytes(32).toString("hex");
  const prefix = raw.slice(0, 12);
  const hash = hashApiKey(raw);
  return { raw, prefix, hash };
}

export async function createApiKey(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    userId,
    name,
    keyHash: hash,
    keyPrefix: prefix,
    active: true,
  });
  return { raw, prefix }; // raw는 한 번만 반환
}

export async function getApiKeysByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      active: apiKeys.active,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(apiKeys)
    .set({ active: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

export async function verifyApiKey(rawKey: string) {
  const db = await getDb();
  if (!db) return null;
  const hash = hashApiKey(rawKey);
  const result = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, active: apiKeys.active, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .limit(1);
  if (!result[0]) return null;
  const key = result[0];
  if (!key.active) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  // 마지막 사용 시간 업데이트
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  // userId로 사용자 조회
  const userResult = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  return userResult[0] ?? null;
}

export async function updatePost(
  id: number,
  authorId: number,
  data: {
    title?: string;
    content?: string;
    excerpt?: string | null;
    thumbnail?: string | null;
    category?: string; // navItems에서 동적으로 관리되는 카테고리 키
    tag?: string | null;
    badge?: string | null;
    status?: "published" | "draft"; // 수정 시 임시저장/발행 선택 (기본값: published)
    isHtmlSource?: boolean; // HTML 소스 탭으로 작성된 글 여부
    isAppMode?: boolean; // JS가 동작하는 HTML 앱 모드
    appEmbedUrl?: string | null; // URL 임베드 모드일 때 외부 URL
    embedWidth?: "content" | "full"; // 임베드 표시 너비
    showInSection?: boolean; // 홈 메인 섹션/최신 글 목록 표시 여부
    allowComments?: boolean; // 댓글 사용 여부
    disableAds?: boolean; // 광고 비활성화 여부
    coupangKeywords?: string | null; // 글별 쿠팡 키워드 (JSON 문자열)
    enableToc?: boolean; // 목차 자동 생성 여부
    customSlug?: string | null; // SEO 슬러그 (직접 입력, 선택적)
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 작성자 본인 확인
  const existing = await getPostById(id);
  if (!existing) throw new Error("Post not found");
  if (existing.authorId !== authorId) throw new Error("Forbidden");

  // customSlug 변경 감지: 이전 슬러그를 slug_history에 저장 (301 리디렉션용)
  if (data.customSlug !== undefined) {
    const prevCustomSlug = (existing as any).customSlug;
    const newCustomSlug = data.customSlug || null;
    // 이전 customSlug가 있고 새 값과 다를 때만 기록
    if (prevCustomSlug && prevCustomSlug !== newCustomSlug) {
      await db.insert(slugHistory).values({ postId: id, oldSlug: prevCustomSlug });
    }
    // 이전 자동 slug도 저장 (처음 customSlug 설정 시)
    if (!prevCustomSlug && newCustomSlug && existing.slug) {
      await db.insert(slugHistory).values({ postId: id, oldSlug: existing.slug });
    }
    // customSlug 중복 체크: 다른 게시글이 같은 customSlug를 이미 사용 중이면 null로 강제 처리
    if (newCustomSlug) {
      const dupCheck = await getPostByCustomSlugOnly(newCustomSlug, id);
      if (dupCheck) {
        data = { ...data, customSlug: null };
        console.warn(`[updatePost] customSlug '${newCustomSlug}' already used by post ${dupCheck.id}, setting to null for post ${id}`);
      }
    }
  }

  await db.update(posts).set({
    ...(data.title !== undefined && { title: data.title }),
    ...(data.content !== undefined && { content: data.content }),
    ...(data.excerpt !== undefined && { excerpt: data.excerpt }),
    ...(data.thumbnail !== undefined && { thumbnail: data.thumbnail }),
    ...(data.category !== undefined && { category: data.category }),
    ...(data.tag !== undefined && { tag: data.tag }),
    ...(data.badge !== undefined && { badge: data.badge }),
    ...(data.isHtmlSource !== undefined && { isHtmlSource: data.isHtmlSource }),
    ...(data.isAppMode !== undefined && { isAppMode: data.isAppMode }),
    ...(data.appEmbedUrl !== undefined && { appEmbedUrl: data.appEmbedUrl }),
    ...(data.embedWidth !== undefined && { embedWidth: data.embedWidth }),
    ...(data.showInSection !== undefined && { showInSection: data.showInSection }),
    ...(data.allowComments !== undefined && { allowComments: data.allowComments }),
    ...(data.disableAds !== undefined && { disableAds: data.disableAds }),
    ...(data.coupangKeywords !== undefined && { coupangKeywords: data.coupangKeywords }),
    ...(data.enableToc !== undefined && { enableToc: data.enableToc }),
    ...(data.customSlug !== undefined && { customSlug: data.customSlug || null }),
    // status가 명시된 경우에만 변경 (미전달 시 기존 상태 유지 - 자동저장/비주얼편집 저장 시 발행 상태 변경 방지)
    ...(data.status !== undefined && { published: data.status !== "draft" }),
    ...(data.status !== undefined && { status: data.status }),
    // 발행(published)으로 변경 시 보관함(deletedAt)에서 꺼내기
    ...(data.status === "published" && { deletedAt: null }),
    updatedAt: new Date(),
    }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  return getPostById(id);
}
/**
 * 게시물 썸네일 URL만 업데이트 (이미지 자동 최적화 완료 후 호출)
 */
export async function updatePostThumbnail(id: number, thumbnailUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(posts).set({ thumbnail: thumbnailUrl, updatedAt: new Date() }).where(eq(posts.id, id));
}

export async function deletePost(id: number, authorId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getPostById(id);
  if (!existing) throw new Error("Post not found");
  if (existing.authorId !== authorId) throw new Error("Forbidden");
    // 소프트 삭제: 보관함으로 이동
  await db.update(posts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  cache.invalidate(`post:id:${id}`);
  if (existing.slug) cache.invalidate(`post:slug:${existing.slug}`);
  if ((existing as any).customSlug) cache.invalidate(`post:slug:${(existing as any).customSlug}`);
  return { success: true };
}
// ─── 임시저장(Draft) 쿼리 ──────────────────────────────────────

export async function saveDraft(
  authorId: number,
  data: {
    title: string;
    content: string;
    excerpt?: string | null;
    thumbnail?: string | null;
    category: string; // navItems에서 동적으로 관리되는 카테고리 키
    tag?: string | null;
    badge?: string | null;
    draftId?: number; // 기존 임시저장 덮어쓰기
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  if (data.draftId) {
    // 기존 임시저장 덮어쓰기 (본인 확인)
    const existing = await getPostById(data.draftId);
    if (!existing) throw new Error("Draft not found");
    if (existing.authorId !== authorId) throw new Error("Forbidden");
    if (existing.status !== "draft") throw new Error("Cannot overwrite published post as draft");
    await db.update(posts).set({
      title: data.title,
      content: data.content,
      excerpt: data.excerpt ?? null,
      thumbnail: data.thumbnail ?? null,
      category: data.category,
      tag: data.tag ?? null,
      badge: data.badge ?? null,
      updatedAt: new Date(),
    }).where(eq(posts.id, data.draftId));
    return { id: data.draftId };
  } else {
    // draftId가 없을 때: 이미 존재하는 빈 임시저장(제목 없음 + 내용 없음)을 재사용하여 중복 생성 방지
    const emptyDrafts = await db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.authorId, authorId),
          eq(posts.status, "draft"),
          or(
            eq(posts.title, "(제목 없음)"),
            eq(posts.title, "")
          )
        )
      )
      .orderBy(desc(posts.updatedAt))
      .limit(1);

    if (emptyDrafts.length > 0) {
      // 빈 임시저장 재사용 (새 레코드 대신 업데이트)
      const reuseId = emptyDrafts[0].id;
      await db.update(posts).set({
        title: data.title || "(제목 없음)",
        content: data.content,
        excerpt: data.excerpt ?? null,
        thumbnail: data.thumbnail ?? null,
        category: data.category,
        tag: data.tag ?? null,
        badge: data.badge ?? null,
        updatedAt: new Date(),
      }).where(eq(posts.id, reuseId));
      return { id: reuseId };
    }

    // 새 임시저장 생성
    const [result] = await db.insert(posts).values({
      title: data.title || "(제목 없음)",
      content: data.content,
      excerpt: data.excerpt ?? null,
      thumbnail: data.thumbnail ?? null,
      category: data.category,
      tag: data.tag ?? null,
      badge: data.badge ?? null,
      authorId,
      status: "draft",
      published: false,
    });
    return { id: (result as any).insertId as number };
  }
}

export async function getDraftsByAuthor(authorId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      thumbnail: posts.thumbnail,
      category: posts.category,
      tag: posts.tag,
      badge: posts.badge,
      status: posts.status,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .where(and(eq(posts.authorId, authorId), eq(posts.status, "draft")))
    .orderBy(desc(posts.updatedAt));
}

export async function publishDraft(id: number, authorId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getPostById(id);
  if (!existing) throw new Error("Draft not found");
  if (existing.authorId !== authorId) throw new Error("Forbidden");
  if (existing.status !== "draft") throw new Error("Post is already published");
  await db.update(posts).set({
    status: "published",
    published: true,
    updatedAt: new Date(),
  }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  // slug 캐시 무효화 (수정 후 재게시 시 이전 캐시가 남아 null 반환되는 버그 방지)
  cache.invalidate(`post:id:${id}`);
  if (existing.slug) cache.invalidate(`post:slug:${existing.slug}`);
  if ((existing as any).customSlug) cache.invalidate(`post:slug:${(existing as any).customSlug}`);
  return getPostById(id);
}

// ─── 관리자 설정 헬퍼 ──────────────────────────────────────────────────────────

import {
  siteConfig,
  sidebarItems,
  homeSections,
  navItems,
  type InsertSidebarItem,
  type InsertHomeSection,
  type InsertNavItem,
} from "../drizzle/schema";

// 사이트 설정 기본값
const DEFAULT_SITE_CONFIG: Record<string, string> = {
  siteTitle: "Smart Auto Guide",
  siteDescription: "AI 앱 만들기, 바이브 코딩, AI 툴 추천 블로그",
  siteSubtitle: "+ Vibe Coding",
  logoText: "S",
  themeAccentColor: "#6366f1",
  footerText: "© 2026 Smart Auto Guide. All rights reserved.",
  googleAnalyticsId: "",
  siteUrl: "https://vibecraftx.com",
  contactEmail: "",
  contactHours: "평일 10:00 - 18:00",
  policyPrivacyUrl: "/privacy",
  policyTermsUrl: "/terms",
  policyAdUrl: "",
  policyPartnerUrl: "",
  pinnedPostsLimit: "3",
  homePageId: "",  // 커스텀 첫화면 페이지 ID (빈 문자열이면 기본 홈 사용)
  mainLayoutWidth: "1400",  // 메인 페이지 최대 폭 (px)
  postContentWidth: "916",  // 글 본문 최대 폭 (px)
  postsPerPage: "15",  // 카테고리 글 목록 페이지당 표시 수
  heroSectionMode: "current",  // 메인 상단 섹션 표시 방식 (current | popular | latest)
  heroPostCount: "6",  // 인기글/최신글 표시 개수
  heroPopularPeriod: "all",  // 인기글 기준 기간 (today | week | month | all)
  vibecraftInsightRows: "2",  // 바이브코딩 인사이트 섹션 표시 줄 수 (1줄=2개, 기본 2줄=4개)
};

export async function getSiteConfigAll(): Promise<Record<string, string>> {
  return cache.get('siteConfig:all', async () => {
    const db = await getDb();
    if (!db) return { ...DEFAULT_SITE_CONFIG };
    const rows = await db.select().from(siteConfig);
    const result = { ...DEFAULT_SITE_CONFIG };
    for (const row of rows) {
      if (row.configKey && row.configValue !== null && row.configValue !== undefined) {
        result[row.configKey] = row.configValue;
      }
    }
    return result;
  }, TTL.LONG);
}

export async function upsertSiteConfig(key: string, value: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .insert(siteConfig)
    .values({ configKey: key, configValue: value })
    .onDuplicateKeyUpdate({ set: { configValue: value } });
  cache.invalidate('siteConfig:all');
  cache.invalidate('admin:siteConfig');
  cache.invalidate('home:initial');
  return { key, value };
}

export async function upsertSiteConfigBulk(config: Record<string, string>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // API 키는 저장 시 trim 처리 (실수로 공백이 포함되면 HMAC 서명 오류 발생)
  const API_KEY_FIELDS = ['coupang_access_key', 'coupang_secret_key'];
  const sanitized = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      API_KEY_FIELDS.includes(key) ? value.trim() : value,
    ])
  );
  await Promise.all(
    Object.entries(sanitized).map(([key, value]) =>
      db.insert(siteConfig).values({ configKey: key, configValue: value })
        .onDuplicateKeyUpdate({ set: { configValue: value } })
    )
  );
  cache.invalidate('siteConfig:all');
  cache.invalidate('admin:siteConfig'); // getSiteConfig 프로시저 캐시 무효화
  cache.invalidate('home:initial');    // getHomeInitialData 프로시저 캐시 무효화 (첫화면 교체 즉시 반영)
  // 관련글 설정 변경 시 캐시 즉시 무효화
  if ('relatedPostsSortBy' in config || 'relatedPostsCount' in config || 'relatedPostsLayout' in config) {
    cache.invalidate('related:cat:');
    cache.invalidate('related:tags:');
  }
  return getSiteConfigAll();
}

// 사이드바 항목
export async function getAllSidebarItems() {
  return cache.get('sidebarItems:all', async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(sidebarItems).orderBy(sidebarItems.side, sidebarItems.sortOrder);
  }, TTL.LONG);
}

export async function getSidebarItemsBySide(side: "left" | "right") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(sidebarItems)
    .where(eq(sidebarItems.side, side))
    .orderBy(sidebarItems.sortOrder);
}

export async function createSidebarItem(data: Omit<InsertSidebarItem, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(sidebarItems).values(data);
  const id = (result as any).insertId as number;
  cache.invalidate('sidebarItems:all');
  return db.select().from(sidebarItems).where(eq(sidebarItems.id, id)).then(r => r[0]);
}

export async function updateSidebarItem(id: number, data: Partial<Omit<InsertSidebarItem, "id" | "createdAt">>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(sidebarItems).set(data).where(eq(sidebarItems.id, id));
  cache.invalidate('sidebarItems:all');
  return db.select().from(sidebarItems).where(eq(sidebarItems.id, id)).then(r => r[0]);
}

export async function deleteSidebarItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(sidebarItems).where(eq(sidebarItems.id, id));
  cache.invalidate('sidebarItems:all');
  return { success: true };
}

export async function reorderSidebarItems(items: { id: number; sortOrder: number }[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  cache.invalidate('sidebarItems:all');
  await Promise.all(
    items.map(({ id, sortOrder }) =>
      db.update(sidebarItems).set({ sortOrder }).where(eq(sidebarItems.id, id))
    )
  );
  return { success: true };
}

// 홈 섹션 설정 (메인 화면 4개 섹션과 일치)
const DEFAULT_HOME_SECTIONS: InsertHomeSection[] = [
  { sectionKey: "ai-apps",   title: "AI로 만드는 자동화 프로그램 (바이브 코딩)", subtitle: "코딩 없이 AI 자동화 앱을 만드는 방법을 배워보세요",   categoryPath: "/category/ai-apps",   sortOrder: 1, visible: true },
  { sectionKey: "my-apps",   title: "진행중인 자동화 프로그램",                  subtitle: "직접 개발한 자동화 프로그램을 무료로 다운로드하세요",  categoryPath: "/category/my-apps",   sortOrder: 2, visible: true },
  { sectionKey: "ai-tools",  title: "AI 툴 추천",                               subtitle: "실제로 써본 AI 도구들을 솔직하게 비교합니다",         categoryPath: "/category/ai-tools",  sortOrder: 3, visible: true },
  { sectionKey: "resources", title: "자료실",                                   subtitle: "무료 템플릿, 가이드, 자료를 다운로드하세요",           categoryPath: "/category/resources", sortOrder: 4, visible: true },
];

export async function getHomeSections() {
  const db = await getDb();
  if (!db) return DEFAULT_HOME_SECTIONS.map((s, i) => ({ ...s, id: i + 1, updatedAt: new Date() }));
  // nav_items 기반으로 홈 섹션 반환 (showOnHome 필드 포함)
  const navRows = await db.select().from(navItems).orderBy(navItems.sortOrder);
  if (navRows.length > 0) {
    return navRows.map(item => ({
      id: item.id,
      sectionKey: extractNavKey(item.path || ''),
      title: item.label,
      subtitle: item.description || '',
      categoryPath: item.path,
      sortOrder: item.sortOrder,
      visible: item.showOnHome !== false, // showOnHome 필드로 표시/숨김 제어
      sectionStyle: item.sectionStyle,
      thumbSize: item.thumbSize,
      displayRows: item.displayRows ?? 1, // 섹션별 표시 줄 수 (1줄=2개 for apps, 3개 for grid 등)
      sectionMarginBottom: item.sectionMarginBottom ?? 36, // 섹션 하단 여백 (px)
      sectionSortMode: (item.sectionSortMode as 'latest' | 'popular') ?? 'latest', // 정렬 방식 (latest | popular)
      updatedAt: item.updatedAt,
    }));
  }
  // nav_items가 없으면 home_sections 폴백
  const rows = await db.select().from(homeSections).orderBy(homeSections.sortOrder);
  if (rows.length === 0) {
    await db.insert(homeSections).values(DEFAULT_HOME_SECTIONS);
    return db.select().from(homeSections).orderBy(homeSections.sortOrder);
  }
  return rows;
}

function extractNavKey(path: string): string {
  return path.replace(/^\/category\//, '').replace(/^\//, '') || path;
}

export async function updateHomeSectionOrder(items: { id: number; sortOrder: number; visible: boolean }[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // nav_items 기반: showOnHome 필드로 표시/숨김 제어
  const navRows = await db.select({ id: navItems.id }).from(navItems);
  const navIds = new Set(navRows.map(r => r.id));
  await Promise.all(
    items.map(({ id, sortOrder, visible }) => {
      if (navIds.has(id)) {
        // nav_items 테이블 업데이트
        return db.update(navItems).set({ sortOrder, showOnHome: visible }).where(eq(navItems.id, id));
      } else {
        // home_sections 테이블 업데이트 (폴백)
        return db.update(homeSections).set({ sortOrder, visible }).where(eq(homeSections.id, id));
      }
    })
  );
  cache.invalidate('navItems:all'); // 섹션 순서/표시 변경 후 캐시 무효화
  return getHomeSections();
}

export async function updateHomeSectionDetail(id: number, data: { title?: string; subtitle?: string; categoryPath?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // nav_items 기반: label/description 업데이트
  const navRows = await db.select({ id: navItems.id }).from(navItems);
  const navIds = new Set(navRows.map(r => r.id));
  if (navIds.has(id)) {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.label = data.title;
    if (data.subtitle !== undefined) updateData.description = data.subtitle;
    if (data.categoryPath !== undefined) updateData.path = data.categoryPath;
    await db.update(navItems).set(updateData).where(eq(navItems.id, id));
    cache.invalidate('navItems:all'); // 섹션 상세 변경 후 캐시 무효화
    const updated = await db.select().from(navItems).where(eq(navItems.id, id)).then(r => r[0]);
    if (!updated) return null;
    return {
      id: updated.id,
      sectionKey: extractNavKey(updated.path || ''),
      title: updated.label,
      subtitle: updated.description || '',
      categoryPath: updated.path,
      sortOrder: updated.sortOrder,
      visible: updated.showOnHome !== false,
      sectionStyle: updated.sectionStyle,
      updatedAt: updated.updatedAt,
    };
  }
  // home_sections 폴백
  await db.update(homeSections).set(data).where(eq(homeSections.id, id));
  return db.select().from(homeSections).where(eq(homeSections.id, id)).then(r => r[0]);
}

// 네비게이션 항목 (메인 화면 헤더 메뉴와 일치)
const DEFAULT_NAV_ITEMS: InsertNavItem[] = [
  { label: "AI로 만드는 자동화 프로그램", path: "/category/ai-apps",   sortOrder: 1, visible: true },
  { label: "진행중인 자동화 프로그램",    path: "/category/my-apps",   sortOrder: 2, visible: true },
  { label: "AI 툴 추천",                path: "/category/ai-tools",  sortOrder: 3, visible: true },
  { label: "자료실",                    path: "/category/resources", sortOrder: 4, visible: true },
];

export async function getNavItemsFromDb() {
  return cache.get('navItems:all', async () => {
    const db = await getDb();
    if (!db) return DEFAULT_NAV_ITEMS.map((n, i) => ({ ...n, id: i + 1, updatedAt: new Date() }));
    const rows = await db.select().from(navItems).orderBy(navItems.sortOrder);
    if (rows.length === 0) {
      await db.insert(navItems).values(DEFAULT_NAV_ITEMS);
      return db.select().from(navItems).orderBy(navItems.sortOrder);
    }
    return rows;
  }, TTL.LONG);
}

/** nav item path 정규화 - 절대 URL(http/https)은 그대로 허용, 상대 경로는 / 접두사 보장 */
function normalizeNavPath(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path; // 외부 링크, 특정 페이지 URL 그대로 저장
  }
  return path.startsWith('/') ? path : `/${path}`;
}

export async function updateNavItemsInDb(items: { id: number; label: string; path: string; sortOrder: number; visible: boolean; sectionStyle?: "featured" | "grid" | "apps" | "latest" | "overlay" | "list" | "list2" | "stat-banner" | "download-grid" | "download-row" | "download-card" | "developers"; description?: string | null; bgColor?: string | null; textColor?: string | null; displayRows?: number; sectionMarginBottom?: number; showOnHome?: boolean; thumbSize?: "sm" | "md" | "lg"; statBannerData?: string | null; sectionSortMode?: "latest" | "popular" }[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await Promise.all(
    items.map(({ id, label, path, sortOrder, visible, sectionStyle, description, bgColor, textColor, displayRows, sectionMarginBottom, showOnHome, thumbSize, sectionSortMode }) =>
      db.update(navItems).set({
        label, path: normalizeNavPath(path), sortOrder, visible,
        ...(sectionStyle !== undefined && { sectionStyle }),
        ...(description !== undefined && { description }),
        ...(bgColor !== undefined && { bgColor: bgColor || null }),
        ...(textColor !== undefined && { textColor: textColor || null }),
        ...(displayRows !== undefined && { displayRows: Math.min(5, Math.max(1, displayRows)) }),
        ...(sectionMarginBottom !== undefined && { sectionMarginBottom: Math.min(500, Math.max(0, sectionMarginBottom)) }),
        ...(showOnHome !== undefined && { showOnHome }),
        ...(thumbSize !== undefined && { thumbSize }),
        ...(sectionSortMode !== undefined && { sectionSortMode }),
        ...((items.find(i => i.id === id)?.statBannerData !== undefined) && { statBannerData: items.find(i => i.id === id)?.statBannerData ?? null }),
      }).where(eq(navItems.id, id))
    )
  );
  cache.invalidate('navItems:all');
  cache.invalidate('admin:navItems');
  cache.invalidate('home:initial');
  return getNavItemsFromDb();
}
export async function createNavItemInDb(data: Omit<InsertNavItem, "id">) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [result] = await db.insert(navItems).values({ ...data, path: normalizeNavPath(data.path || "/") });
  const id = (result as any).insertId as number;
  cache.invalidate('navItems:all');
  cache.invalidate('admin:navItems');
  cache.invalidate('home:initial');
  return db.select().from(navItems).where(eq(navItems.id, id)).then(r => r[0]);
}
export async function deleteNavItemFromDb(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(navItems).where(eq(navItems.id, id));
  cache.invalidate('navItems:all');
  cache.invalidate('admin:navItems');
  cache.invalidate('home:initial');
  return { success: true };
}

// 카테고리 소개 HTML 업데이트
export async function updateNavItemIntroHtml(id: number, introHtml: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(navItems).set({ introHtml: introHtml || null }).where(eq(navItems.id, id));
  return { success: true };
}

// 관리자 전체 게시물 조회
export async function getAllPostsAdmin() {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  return db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      category: posts.category,
      status: posts.status,
      published: posts.published,
      views: posts.views,
      likes: posts.likes,
      authorId: posts.authorId,
      authorName: users.name,
      createdAt: posts.createdAt,
      updatedAt: posts.updatedAt,
      isPinned: posts.isPinned,
      pinnedAt: posts.pinnedAt,
      isAppMode: posts.isAppMode,
      embedWidth: posts.embedWidth,
      showInSection: posts.showInSection,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(isNull(posts.deletedAt))
    .orderBy(desc(posts.createdAt));
}

export async function adminToggleShowInSection(id: number, showInSection: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(posts).set({ showInSection, updatedAt: new Date() }).where(eq(posts.id, id));
  return { success: true };
}

export async function adminToggleAllowComments(id: number, allowComments: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(posts).set({ allowComments, updatedAt: new Date() }).where(eq(posts.id, id));
  return { success: true };
}

export async function bulkToggleAllowComments(ids: number[], allowComments: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.update(posts).set({ allowComments, updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function batchUpdatePostEmbedWidth(ids: number[], embedWidth: "content" | "full") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.update(posts).set({ embedWidth, updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function adminUpdatePostStatus(id: number, status: "draft" | "published") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(posts).set({
    status,
    published: status === "published",
    updatedAt: new Date(),
  }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  return { success: true };
}

export async function adminDeletePost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 소프트 삭제: 보관함으로 이동
  await db.update(posts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  return { success: true };
}

export async function adminRestorePost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(posts).set({ deletedAt: null, updatedAt: new Date() }).where(eq(posts.id, id));
  cache.invalidate('posts:');
  return { success: true };
}

export async function adminHardDeletePost(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(posts).where(eq(posts.id, id));
  cache.invalidate('posts:');
  return { success: true };
}

export async function getDeletedPostsAdmin() {
  const db = await getDb();
  if (!db) return [];
  const { isNotNull } = await import("drizzle-orm");
  return db
    .select({
      id: posts.id,
      title: posts.title,
      category: posts.category,
      status: posts.status,
      published: posts.published,
      views: posts.views,
      likes: posts.likes,
      authorId: posts.authorId,
      authorName: users.name,
      createdAt: posts.createdAt,
      deletedAt: posts.deletedAt,
      updatedAt: posts.updatedAt,
      content: posts.content,
      thumbnail: posts.thumbnail,
      isHtmlSource: posts.isHtmlSource,
      slug: posts.slug,
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(isNotNull(posts.deletedAt))
    .orderBy(desc(posts.deletedAt));
}

export async function getSimilarPosts(postId: number, category: string, limit = 2) {
  const db = await getDb();
  if (!db) return [];
  const { not } = await import("drizzle-orm");
  return db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.category, category as any),
        eq(posts.status, "published"),
        eq(posts.published, true),
        not(eq(posts.id, postId))
      )
    )
    .orderBy(desc(posts.createdAt))
    .limit(limit);
}

// ─── 정책 페이지 (legal pages) ───────────────────────────────────────────────
export async function getLegalPage(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const { legalPages } = await import("../drizzle/schema");
  const rows = await db.select().from(legalPages).where(eq(legalPages.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function upsertLegalPage(slug: string, title: string, content: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { legalPages } = await import("../drizzle/schema");
  const existing = await getLegalPage(slug);
  if (existing) {
    await db.update(legalPages)
      .set({ title, content, updatedAt: new Date() })
      .where(eq(legalPages.slug, slug));
  } else {
    await db.insert(legalPages).values({ slug, title, content });
  }
  return { success: true };
}

export async function agreeToTerms(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { users } = await import("../drizzle/schema");
  await db.update(users)
    .set({ agreedToTerms: true, agreedAt: new Date() })
    .where(eq(users.id, userId));
}

// ===== 댓글 관련 함수 =====
export async function getCommentsByPost(
  postId: number,
  includeHidden = false,
  opts?: { limit?: number; cursor?: number }
) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null as number | null };
  const { comments } = await import("../drizzle/schema");
  const limit = opts?.limit ?? 5;
  const cursor = opts?.cursor;

  const whereClause = includeHidden
    ? cursor
      ? and(eq(comments.postId, postId), gt(comments.id, cursor))
      : eq(comments.postId, postId)
    : cursor
      ? and(eq(comments.postId, postId), eq(comments.isHidden, false), gt(comments.id, cursor))
      : and(eq(comments.postId, postId), eq(comments.isHidden, false));

  const rows = await db.select().from(comments)
    .where(whereClause)
    .orderBy(comments.id)
    .limit(limit + 1);

  let nextCursor: number | null = null;
  if (rows.length > limit) {
    rows.splice(limit); // 초과분 제거
    nextCursor = rows[rows.length - 1].id; // 마지막 반환 댓글 id
  }
  return { items: rows, nextCursor };
}

export async function addComment(data: {
  postId: number;
  userId: string;
  userName: string;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { comments } = await import("../drizzle/schema");
  const [result] = await db.insert(comments).values(data);
  return { id: (result as any).insertId as number };
}

export async function getCommentsByPage(
  pageId: number,
  includeHidden = false,
  opts?: { limit?: number; cursor?: number }
) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null as number | null };
  const { comments } = await import("../drizzle/schema");
  const limit = opts?.limit ?? 5;
  const cursor = opts?.cursor;

  const whereClause = includeHidden
    ? cursor
      ? and(eq(comments.pageId, pageId), gt(comments.id, cursor))
      : eq(comments.pageId, pageId)
    : cursor
      ? and(eq(comments.pageId, pageId), eq(comments.isHidden, false), gt(comments.id, cursor))
      : and(eq(comments.pageId, pageId), eq(comments.isHidden, false));

  const rows = await db.select().from(comments)
    .where(whereClause)
    .orderBy(comments.id)
    .limit(limit + 1);

  let nextCursor: number | null = null;
  if (rows.length > limit) {
    rows.splice(limit);
    nextCursor = rows[rows.length - 1].id;
  }
  return { items: rows, nextCursor };
}

export async function addPageComment(data: {
  pageId: number;
  userId: string;
  userName: string;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { comments } = await import("../drizzle/schema");
  const [result] = await db.insert(comments).values(data);
  return { id: (result as any).insertId as number };
}

export async function toggleCommentVisibility(id: number, isHidden: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { comments } = await import("../drizzle/schema");
  await db.update(comments).set({ isHidden }).where(eq(comments.id, id));
  return { success: true };
}

export async function deleteComment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { comments } = await import("../drizzle/schema");
  await db.delete(comments).where(eq(comments.id, id));
  return { success: true };
}

export async function setAiReply(id: number, aiReply: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { comments } = await import("../drizzle/schema");
  await db.update(comments).set({ aiReply, aiRepliedAt: new Date() }).where(eq(comments.id, id));
  return { success: true };
}

export async function getAllComments() {
  const db = await getDb();
  if (!db) return [];
  const { comments } = await import("../drizzle/schema");
  return db.select().from(comments).orderBy(comments.createdAt);
}

// ===== 챗봇 대화 세션 관련 함수 =====
export async function getChatSessions(userId: string) {
  const db = await getDb();
  if (!db) return [];
  const { chatSessions } = await import("../drizzle/schema");
  return db.select({
    id: chatSessions.id,
    title: chatSessions.title,
    updatedAt: chatSessions.updatedAt,
    createdAt: chatSessions.createdAt,
  }).from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(chatSessions.updatedAt);
}

export async function getChatSession(id: number, userId: string) {
  const db = await getDb();
  if (!db) return null;
  const { chatSessions } = await import("../drizzle/schema");
  const rows = await db.select().from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
  return rows[0] ?? null;
}

export async function upsertChatSession(data: {
  id?: number;
  userId: string;
  title: string;
  messages: string; // JSON string
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { chatSessions } = await import("../drizzle/schema");
  if (data.id) {
    await db.update(chatSessions)
      .set({ title: data.title, messages: data.messages })
      .where(and(eq(chatSessions.id, data.id), eq(chatSessions.userId, data.userId)));
    return { id: data.id };
  } else {
    const [result] = await db.insert(chatSessions).values({
      userId: data.userId,
      title: data.title,
      messages: data.messages,
    });
    return { id: (result as any).insertId as number };
  }
}

export async function deleteChatSession(id: number, userId: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { chatSessions } = await import("../drizzle/schema");
  await db.delete(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
  return { success: true };
}

// ─── 조회수 상세 로그 ────────────────────────────────────────────────────────
/** referrer URL에서 출처 유형 판별 */
function classifyReferrerType(referrer: string, siteOrigins: string[]): "direct" | "search" | "social" | "internal" | "external" | "share" {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    const domain = url.hostname.replace(/^www\./, "");
    if (siteOrigins.some(o => referrer.startsWith(o))) return "internal";
    const searchEngines = ["google.com", "naver.com", "bing.com", "daum.net", "yahoo.com", "baidu.com", "duckduckgo.com"];
    if (searchEngines.some(s => domain.includes(s))) return "search";
    const socialDomains = ["facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "tiktok.com", "linkedin.com", "kakao.com", "band.us", "pinterest.com", "reddit.com", "t.co"];
    if (socialDomains.some(s => domain.includes(s))) return "social";
    const shareDomains = ["bit.ly", "tinyurl.com", "short.io", "han.gl", "me2.do"];
    if (shareDomains.some(s => domain.includes(s))) return "share";
    return "external";
  } catch {
    return "direct";
  }
}

export async function logPostView(data: {
  postId: number;
  visitorType: "admin" | "author" | "logged_in" | "guest";
  referrer: string;
  userAgent: string;
  siteOrigins?: string[];
}) {
  const db = await getDb();
  if (!db) return;
  const { postViewLogs } = await import("../drizzle/schema");
  let referrerDomain = "";
  try {
    if (data.referrer) referrerDomain = new URL(data.referrer).hostname.replace(/^www\./, "");
  } catch { /* ignore */ }
  const referrerType = classifyReferrerType(data.referrer, data.siteOrigins ?? []);
  await db.insert(postViewLogs).values({
    postId: data.postId,
    visitorType: data.visitorType,
    referrer: (data.referrer ?? "").slice(0, 500),
    referrerDomain: referrerDomain.slice(0, 200),
    referrerType,
    userAgent: (data.userAgent ?? "").slice(0, 500),
  });
}

export async function getPostViewStats(postId: number) {
  const db = await getDb();
  if (!db) return null;
  const { postViewLogs } = await import("../drizzle/schema");
  const logs = await db.select().from(postViewLogs)
    .where(eq(postViewLogs.postId, postId))
    .orderBy(desc(postViewLogs.createdAt))
    .limit(500);

  const byVisitorType: Record<string, number> = {};
  const byReferrerType: Record<string, number> = {};
  const byReferrerDomain: Record<string, number> = {};
  for (const log of logs) {
    byVisitorType[log.visitorType] = (byVisitorType[log.visitorType] ?? 0) + 1;
    byReferrerType[log.referrerType] = (byReferrerType[log.referrerType] ?? 0) + 1;
    if (log.referrerDomain) {
      byReferrerDomain[log.referrerDomain] = (byReferrerDomain[log.referrerDomain] ?? 0) + 1;
    }
  }
  return { total: logs.length, byVisitorType, byReferrerType, byReferrerDomain, recentLogs: logs.slice(0, 50) };
}

// ─── 카테고리별 댓글 설정 ─────────────────────────────────────────────────────
export async function getCategoryCommentSettings() {
  const db = await getDb();
  if (!db) return [];
  const { categoryCommentSettings } = await import("../drizzle/schema");
  return db.select().from(categoryCommentSettings);
}

export async function getCategoryCommentSetting(categoryKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const { categoryCommentSettings } = await import("../drizzle/schema");
  const [row] = await db.select().from(categoryCommentSettings)
    .where(eq(categoryCommentSettings.categoryKey, categoryKey));
  return row?.commentsEnabled ?? true;
}

export async function upsertCategoryCommentSetting(categoryKey: string, commentsEnabled: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { categoryCommentSettings } = await import("../drizzle/schema");
  await db.insert(categoryCommentSettings)
    .values({ categoryKey, commentsEnabled })
    .onDuplicateKeyUpdate({ set: { commentsEnabled } });
  return { categoryKey, commentsEnabled };
}

// ─── 자동화 발행 로그 ─────────────────────────────────────────────────────────
export async function getPublishLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const { publishLogs } = await import("../drizzle/schema");
  return db
    .select()
    .from(publishLogs)
    .orderBy(desc(publishLogs.createdAt))
    .limit(limit);
}

// ─── 고정글 관리 ─────────────────────────────────────────────────────────────
export async function getPinnedPosts() {
  return cache.get('posts:pinned', async () => {
    const db = await getDb();
    if (!db) return [];
    const { posts: postsTable } = await import("../drizzle/schema");
    const { eq: eqOp, desc: descOp } = await import("drizzle-orm");
    return db
      .select()
      .from(postsTable)
      .where(eqOp(postsTable.isPinned, true))
      .orderBy(descOp(postsTable.pinnedAt))
      .limit(10);
  }, TTL.MEDIUM);
}

export async function getLatestPosts(limit: number = 20) {
  return cache.get(`posts:latest:${limit}`, async () => {
    const db = await getDb();
    if (!db) return [];
    const { posts: postsTable } = await import("../drizzle/schema");
    const { eq: eqOp, desc: descOp, and: andOp, isNull: isNullOp, ne: neOp } = await import("drizzle-orm");
    return db
      .select()
      .from(postsTable)
      .where(andOp(
        eqOp(postsTable.status, "published"),
        eqOp(postsTable.showInSection, true),
        isNullOp(postsTable.deletedAt),
        neOp(postsTable.category, "resources"),
      ))
      .orderBy(descOp(postsTable.createdAt))
      .limit(limit);
  }, TTL.SHORT);
}

export async function getPopularPosts(limit: number = 6, period: "today" | "week" | "month" | "all" = "all") {
  return cache.get(`posts:popular:${limit}:${period}`, async () => {
    const db = await getDb();
    if (!db) return [];
    const { posts: postsTable } = await import("../drizzle/schema");
    const { eq: eqOp, desc: descOp, and: andOp, isNull: isNullOp, ne: neOp, gte: gteOp } = await import("drizzle-orm");

    // 기간 필터 계산
    let sinceDate: Date | null = null;
    const now = new Date();
    if (period === "today") {
      sinceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (period === "week") {
      sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      sinceDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    const conditions = [
      eqOp(postsTable.status, "published"),
      eqOp(postsTable.showInSection, true),
      isNullOp(postsTable.deletedAt),
      neOp(postsTable.category, "resources"),
      ...(sinceDate ? [gteOp(postsTable.createdAt, sinceDate)] : []),
    ];

    return db
      .select()
      .from(postsTable)
      .where(andOp(...conditions as [any, ...any[]]))
      .orderBy(descOp(postsTable.views))
      .limit(limit);
  }, TTL.SHORT);
}

export async function togglePinnedPost(postId: number, pin: boolean) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { posts: postsTable } = await import("../drizzle/schema");
  const { eq: eqOp } = await import("drizzle-orm");
  await db
    .update(postsTable)
    .set({ isPinned: pin, pinnedAt: pin ? new Date() : null })
    .where(eqOp(postsTable.id, postId));
  return { postId, isPinned: pin };
}

// ─── 예약 발행 자동 처리 ──────────────────────────────────────────────────────
export async function publishScheduledPosts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const { posts: postsTable } = await import("../drizzle/schema");
  const { and: andOp, eq: eqOp, lte, isNotNull } = await import("drizzle-orm");
  const now = new Date();
  const scheduled = await db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(
      andOp(
        eqOp(postsTable.status, "draft"),
        eqOp(postsTable.published, false),
        isNotNull(postsTable.scheduledAt),
        lte(postsTable.scheduledAt, now)
      )
    );
  if (scheduled.length === 0) return 0;
  for (const row of scheduled) {
    await db
      .update(postsTable)
      .set({ status: "published", published: true, scheduledAt: null })
      .where(eqOp(postsTable.id, row.id));
  }
  return scheduled.length;
}

// ─── 회원 관리 ────────────────────────────────────────────────────────────────

/** 전체 회원 목록 조회 (관리자 전용) */
export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      role: users.role,
      isOwner: users.isOwner,
      canWrite: users.canWrite,
      canDownload: users.canDownload,
      memo: users.memo,
      isBanned: users.isBanned,
      agreedToTerms: users.agreedToTerms,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      username: users.username,
      isFeaturedDeveloper: users.isFeaturedDeveloper,
      featuredOrder: users.featuredOrder,
      bio: users.bio,
      profileImage: users.profileImage,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}

/** 회원 권한 업데이트 (관리자 전용) */
export async function updateUserPermissions(
  userId: number,
  data: {
    role?: "user" | "admin" | "sub_admin";
    isOwner?: boolean;
    canWrite?: boolean;
    canDownload?: boolean;
    memo?: string | null;
    isBanned?: boolean;
    isFeaturedDeveloper?: boolean;
    featuredOrder?: number;
    bio?: string | null;
    profileImage?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(users).set(data).where(eq(users.id, userId));
  return { ok: true };
}

/** 카테고리별 글쓰기 권한 목록 조회 */
export async function getCategoryWritePermissions(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const { categoryWritePermissions } = await import('../drizzle/schema');
  const rows = await db
    .select({ categoryKey: categoryWritePermissions.categoryKey })
    .from(categoryWritePermissions)
    .where(eq(categoryWritePermissions.userId, userId));
  return rows.map(r => r.categoryKey);
}

/** 카테고리별 글쓰기 권한 저장 (기존 삭제 후 재삽입) */
export async function setCategoryWritePermissions(userId: number, categoryKeys: string[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const { categoryWritePermissions } = await import('../drizzle/schema');
  // 기존 권한 삭제
  await db.delete(categoryWritePermissions).where(eq(categoryWritePermissions.userId, userId));
  // 새 권한 삽입
  if (categoryKeys.length > 0) {
    await db.insert(categoryWritePermissions).values(
      categoryKeys.map(key => ({ userId, categoryKey: key }))
    );
  }
}

/** 모든 사용자의 카테고리별 글쓰기 권한 조회 */
export async function getAllCategoryWritePermissions(): Promise<{ userId: number; categoryKey: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const { categoryWritePermissions } = await import('../drizzle/schema');
  return db.select({ userId: categoryWritePermissions.userId, categoryKey: categoryWritePermissions.categoryKey })
    .from(categoryWritePermissions);
}

// ─── 태그 관리 ────────────────────────────────────────────────────────────────
import { postTags } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

/** 게시물의 태그 목록 조회 */
export async function getTagsByPost(postId: number): Promise<string[]> {
  return cache.get(`tags:post:${postId}`, async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({ tag: postTags.tag })
      .from(postTags)
      .where(eq(postTags.postId, postId))
      .orderBy(postTags.createdAt);
    return rows.map(r => r.tag);
  }, TTL.MEDIUM);
}

/** 게시물 태그 저장 (기존 태그 삭제 후 재삽입) */
export async function upsertPostTags(postId: number, tags: string[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(postTags).where(eq(postTags.postId, postId));
  const cleaned = tags
    .map(t => t.trim().toLowerCase())
    .filter(t => {
      if (t.length === 0 || t.length > 100) return false;
      // 이메일 형식 필터링 (xxx@xxx.xxx 패턴)
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
      // # 기호로 시작하는 태그 필터링 (해시태그 형식 오입력)
      if (t.startsWith('#')) return false;
      // $ 기호만 있는 태그 필터링
      if (/^[$%^*=<>|\\]+$/.test(t)) return false;
      return true;
    })
    .slice(0, 20);
  if (cleaned.length === 0) return;
  await db.insert(postTags).values(cleaned.map(tag => ({ postId, tag })));
  // 태그 캐시 무효화
  cache.invalidate(`tags:post:${postId}`);
  cache.invalidate('tags:all');
}

/** 특정 태그가 붙은 게시물 목록 조회 (발행된 글만) */
export async function getPostsByTag(tag: string) {
  return cache.get(`posts:tag:${tag.trim().toLowerCase()}`, async () => {
    const db = await getDb();
    if (!db) return [];
    const tagRows = await db
      .select({ postId: postTags.postId })
      .from(postTags)
      .where(eq(postTags.tag, tag.trim().toLowerCase()));
    if (tagRows.length === 0) return [];
    const postIds = tagRows.map(r => r.postId);
    return db
      .select({
        id: posts.id,
        title: posts.title,
        excerpt: posts.excerpt,
        thumbnail: posts.thumbnail,
        category: posts.category,
        tag: posts.tag,
        badge: posts.badge,
        views: posts.views,
        likes: posts.likes,
        slug: posts.slug,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.published, true), inArray(posts.id, postIds)))
      .orderBy(desc(posts.createdAt));
  }, TTL.MEDIUM);
}

/** 사이트 전체 태그 목록 (사용 빈도 순) */
export async function getAllTags(): Promise<{ tag: string; count: number }[]> {
  return cache.get('tags:all', async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        tag: postTags.tag,
        count: count(postTags.id),
      })
      .from(postTags)
      .innerJoin(posts, and(eq(postTags.postId, posts.id), eq(posts.published, true)))
      .groupBy(postTags.tag)
      .orderBy(desc(count(postTags.id)));
    return rows.map(r => ({ tag: r.tag, count: Number(r.count) }));
  }, TTL.MEDIUM);
}

/**
 * 태그 기반 관련 글 조회 (현재 글 제외, 태그 매칭 수 많은 순 정렬)
 * postId: 현재 글 ID (결과에서 제외)
 * tags: 현재 글의 태그 배열
 * limit: 최대 반환 수 (기본 4)
 */
export async function getRelatedPostsByTags(
  postId: number,
  tags: string[],
  limit = 4
): Promise<{
  id: number;
  title: string;
  excerpt: string | null;
  thumbnail: string | null;
  category: string | null;
  tag: string | null;
  badge: string | null;
  views: number | null;
  slug: string | null;
  createdAt: Date | null;
  matchCount: number;
}[]> {
  const tagKey = [...tags].sort().join(',');
  return cache.get(`related:tags:${postId}:${tagKey}:${limit}`, async () => {
    const db = await getDb();
    if (!db || tags.length === 0) return [];
    // 각 태그별로 해당 태그를 가진 게시물 ID 조회
    const tagRows = await db
      .select({ postId: postTags.postId, tag: postTags.tag })
      .from(postTags)
      .where(inArray(postTags.tag, tags));
    // 현재 글 제외 후 postId별 매칭 태그 수 집계
    const countMap = new Map<number, number>();
    for (const row of tagRows) {
      if (row.postId === postId) continue;
      countMap.set(row.postId, (countMap.get(row.postId) || 0) + 1);
    }
    if (countMap.size === 0) return [];
    // 매칭 수 많은 순으로 정렬 후 상위 limit개 ID 추출
    const sortedIds = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    const relatedPosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        excerpt: posts.excerpt,
        thumbnail: posts.thumbnail,
        category: posts.category,
        tag: posts.tag,
        badge: posts.badge,
        views: posts.views,
        slug: posts.slug,
        createdAt: posts.createdAt,
      })
      .from(posts)
      .where(and(eq(posts.published, true), inArray(posts.id, sortedIds)));
    // 매칭 수 순서 유지 (DB 반환 순서 무관)
    return relatedPosts
      .map(p => ({ ...p, matchCount: countMap.get(p.id) || 0 }))
      .sort((a, b) => b.matchCount - a.matchCount);
  }, TTL.MEDIUM);
}

// ─── 커스텀 페이지 CRUD ───────────────────────────────────────────────────────
export async function getAllCustomPages() {
  const db = await getDb();
  if (!db) return [];
  const { customPages } = await import("../drizzle/schema");
  return db.select().from(customPages)
    .where(eq(customPages.archivedStatus, 0))
    .orderBy(desc(customPages.createdAt));
}

// 보관된 페이지 포함 전체 슬러그 목록 (중복 체크용)
export async function getAllCustomPageSlugs(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const { customPages } = await import("../drizzle/schema");
  const rows = await db.select({ slug: customPages.slug }).from(customPages);
  return rows.map(r => r.slug);
}

export async function getPublishedCustomPages() {
  const db = await getDb();
  if (!db) return [];
  const { customPages } = await import("../drizzle/schema");
  return db.select().from(customPages)
    .where(and(eq(customPages.published, true), eq(customPages.archivedStatus, 0)))
    .orderBy(customPages.sortOrder, customPages.createdAt);
}

// 네비게이션에 표시할 커스텀 페이지 목록 (published=true AND show_in_nav=true)
export async function getNavCustomPages() {
  const db = await getDb();
  if (!db) return [];
  const { customPages } = await import("../drizzle/schema");
  return db.select({
    id: customPages.id,
    slug: customPages.slug,
    title: customPages.title,
    sortOrder: customPages.sortOrder,
  }).from(customPages)
    .where(and(eq(customPages.published, true), eq(customPages.showInNav, true), eq(customPages.archivedStatus, 0)))
    .orderBy(customPages.sortOrder, customPages.createdAt);
}

export async function getCustomPageBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const { customPages } = await import("../drizzle/schema");
  const rows = await db.select().from(customPages).where(eq(customPages.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getCustomPageById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { customPages } = await import("../drizzle/schema");
  const rows = await db.select().from(customPages).where(eq(customPages.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createCustomPage(data: {
  slug: string;
  title: string;
  description?: string;
  sectionsJson?: string;
  published?: boolean;
  showInNav?: boolean;
  hideSidebar?: boolean;
  hideChrome?: boolean;
  contentWidth?: number | null;
  postListCategory?: string | null;
  sortOrder?: number;
  thumbnail?: string | null;
  membersOnly?: boolean;
  titleAlign?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages } = await import("../drizzle/schema");
  const [result] = await db.insert(customPages).values({
    slug: data.slug,
    title: data.title,
    description: data.description ?? "",
    sectionsJson: data.sectionsJson ?? "[]",
    published: data.published ?? false,
    showInNav: data.showInNav ?? false,
    hideSidebar: data.hideSidebar ?? false,
    hideChrome: data.hideChrome ?? false,
    contentWidth: data.contentWidth ?? null,
    postListCategory: data.postListCategory ?? null,
    sortOrder: data.sortOrder ?? 0,
    thumbnail: data.thumbnail ?? null,
    membersOnly: data.membersOnly ?? false,
    titleAlign: data.titleAlign ?? "left",
  });
  return { id: (result as any).insertId as number };
}

export async function updateCustomPage(id: number, data: Partial<{
  slug: string;
  title: string;
  description: string;
  sectionsJson: string;
  published: boolean;
  showInNav: boolean;
  hideSidebar: boolean;
  hideChrome: boolean;
  contentWidth: number | null;
  postListCategory: string | null;
  sortOrder: number;
  commentsEnabled: boolean;
  mainSectionKey: string | null;
  thumbnail: string | null;
  membersOnly: boolean;
  titleAlign: string;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages } = await import("../drizzle/schema");
  await db.update(customPages).set(data).where(eq(customPages.id, id));
  return { success: true };
}

export async function deleteCustomPage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages } = await import("../drizzle/schema");
  await db.delete(customPages).where(eq(customPages.id, id));
  return { success: true };
}

/** 페이지를 보관함으로 이동 (완전 삭제 대신 archived_status=1로 변경) */
export async function archiveCustomPage(id: number, memo?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages } = await import("../drizzle/schema");
  await db.update(customPages)
    .set({ archivedStatus: 1, published: false, archiveMemo: memo ?? null })
    .where(eq(customPages.id, id));
  return { success: true };
}

/** 보관함에 있는 페이지 목록 조회 */
export async function getArchivedCustomPages() {
  const db = await getDb();
  if (!db) return [];
  const { customPages } = await import("../drizzle/schema");
  return db.select().from(customPages)
    .where(eq(customPages.archivedStatus, 1))
    .orderBy(customPages.updatedAt);
}

/** 보관함에서 페이지 복원 (archived_status=0으로 변경) */
export async function restoreCustomPage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages } = await import("../drizzle/schema");
  await db.update(customPages).set({ archivedStatus: 0, archiveMemo: null }).where(eq(customPages.id, id));
  return { success: true };
}

/** 보관함에서 페이지 영구 삭제 (DB에서 완전 제거) */
export async function permanentDeleteCustomPage(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { customPages, pageUpgradeHistory } = await import("../drizzle/schema");
  // 업그레이드 이력도 함께 삭제
  await db.delete(pageUpgradeHistory).where(eq(pageUpgradeHistory.pageId, id));
  await db.delete(customPages).where(eq(customPages.id, id));
  return { success: true };
}

export async function incrementCustomPageView(id: number) {
  const db = await getDb();
  if (!db) return;
  const { customPages } = await import("../drizzle/schema");
  await db.update(customPages)
    .set({ viewCount: sql`${customPages.viewCount} + 1` })
    .where(eq(customPages.id, id));
}

// ─── 페이지 업그레이드 이력 ───────────────────────────────────────────────────────────────────────────────

/** 업그레이드 전 현재 sectionsJson을 이력에 백업 */
export async function savePageUpgradeHistory(pageId: number, pageTitle: string, sectionsJson: string, note = '업그레이드 전 자동 백업', memo?: string) {
  const db = await getDb();
  if (!db) return;
  const { pageUpgradeHistory } = await import("../drizzle/schema");
  await db.insert(pageUpgradeHistory).values({ pageId, pageTitle, sectionsJson, note, memo: memo ?? null });
  // 최대 10개만 유지 (오래된 이력 자동 정리)
  const all = await db.select({ id: pageUpgradeHistory.id })
    .from(pageUpgradeHistory)
    .where(eq(pageUpgradeHistory.pageId, pageId))
    .orderBy(desc(pageUpgradeHistory.createdAt));
  if (all.length > 10) {
    const toDelete = all.slice(10).map((r: { id: number }) => r.id);
    await db.delete(pageUpgradeHistory).where(inArray(pageUpgradeHistory.id, toDelete));
  }
}

/** 페이지별 업그레이드 이력 목록 조회 (createdAt 내림차순) */
export async function getPageUpgradeHistory(pageId: number) {
  const db = await getDb();
  if (!db) return [];
  const { pageUpgradeHistory } = await import("../drizzle/schema");
  return db.select()
    .from(pageUpgradeHistory)
    .where(eq(pageUpgradeHistory.pageId, pageId))
    .orderBy(desc(pageUpgradeHistory.createdAt));
}

/** 특정 이력 ID로 페이지 콘텐츠 복원 */
export async function restorePageFromHistory(historyId: number) {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  const { pageUpgradeHistory, customPages } = await import("../drizzle/schema");
  const [history] = await db.select().from(pageUpgradeHistory).where(eq(pageUpgradeHistory.id, historyId));
  if (!history) throw new Error('이력을 찾을 수 없습니다.');
  // 복원 전 현재 상태를 다시 백업
  const [currentPage] = await db.select().from(customPages).where(eq(customPages.id, history.pageId));
  if (currentPage) {
    await savePageUpgradeHistory(currentPage.id, currentPage.title, currentPage.sectionsJson, '복원 전 자동 백업');
  }
  await db.update(customPages)
    .set({ sectionsJson: history.sectionsJson })
    .where(eq(customPages.id, history.pageId));
  return { success: true, pageId: history.pageId };
}

// ─── 카테고리 기반 관련글 ─────────────────────────────────────────────────────
export async function getRelatedByCategory(
  postId: number,
  category: string,
  limit = 3,
  sortBy: 'latest' | 'views' | 'likes' = 'latest'
): Promise<{
  id: number;
  title: string;
  excerpt: string | null;
  thumbnail: string | null;
  category: string | null;
  tag: string | null;
  badge: string | null;
  views: number | null;
  likes: number | null;
  slug: string | null;
  createdAt: Date | null;
}[]> {
  return cache.get(`related:cat:${postId}:${category}:${limit}:${sortBy}`, async () => {
  const db = await getDb();
  if (!db) return [];

  const selectFields = {
    id: posts.id,
    title: posts.title,
    excerpt: posts.excerpt,
    thumbnail: posts.thumbnail,
    category: posts.category,
    tag: posts.tag,
    badge: posts.badge,
    views: posts.views,
    likes: posts.likes,
    slug: posts.slug,
    createdAt: posts.createdAt,
  };

  const orderCol = sortBy === 'views' ? desc(posts.views)
    : sortBy === 'likes' ? desc(posts.likes)
    : desc(posts.createdAt);

  // 1차: 같은 카테고리에서 조회
  let result: typeof selectFields extends Record<string, unknown> ? any[] : any[] = [];
  if (category) {
    result = await db
      .select(selectFields)
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.category, category),
        sql`${posts.id} != ${postId}`
      ))
      .orderBy(orderCol)
      .limit(limit);
  }

  // 2차 폴백: 부족하면 다른 카테고리 인기글로 채우기
  if (result.length < limit) {
    const needed = limit - result.length;
    const existingIds = [postId, ...result.map((r: any) => r.id)];
    const fallback = await db
      .select(selectFields)
      .from(posts)
      .where(and(
        eq(posts.published, true),
        sql`${posts.id} NOT IN (${sql.join(existingIds.map(id => sql`${id}`), sql`, `)})`
      ))
      .orderBy(orderCol)
      .limit(needed);
    result = [...result, ...fallback];
  }

  return result;
  }, TTL.MEDIUM);
}

// ─── 일괄 작업 (게시물 관리 다중 선택) ──────────────────────────────────────────
export async function bulkUpdatePostStatus(ids: number[], status: "draft" | "published") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.update(posts).set({ status, updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function bulkDeletePosts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  // 소프트 삭제: 보관함으로 이동
  await db.update(posts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function bulkUpdatePostCategory(ids: number[], category: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.update(posts).set({ category: category as any, updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function bulkRestorePosts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  // 복원: deletedAt을 null로, status를 published로 변경
  await db.update(posts).set({ deletedAt: null, status: "published", updatedAt: new Date() }).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

export async function bulkHardDeletePosts(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.delete(posts).where(inArray(posts.id, ids));
  return { success: true, count: ids.length };
}

// ─── 백업 / 복원 ─────────────────────────────────────────────────────────────

/** 전체 DB 데이터를 JSON 직렬화 가능한 객체로 반환 */
export async function exportAllData() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const {
    postTags: postTagsTable,
    vibeApps: vibeAppsSchema,
    appReviews: appReviewsSchema,
    postLikes: postLikesSchema,
    siteConfig: siteConfigSchema,
    sidebarItems: sidebarItemsSchema,
    homeSections: homeSectionsSchema,
    navItems: navItemsSchema,
    legalPages: legalPagesSchema,
    comments: commentsSchema,
    categoryCommentSettings: categoryCommentSettingsSchema,
    customPages: customPagesSchema,
  } = await import("../drizzle/schema");

  const [
    postsData,
    postTagsData,
    vibeAppsData,
    appReviewsData,
    postLikesData,
    siteConfigData,
    sidebarItemsData,
    homeSectionsData,
    navItemsData,
    legalPagesData,
    commentsData,
    categoryCommentSettingsData,
    customPagesData,
  ] = await Promise.all([
    db.select().from(posts),
    db.select().from(postTagsTable),
    db.select().from(vibeAppsSchema),
    db.select().from(appReviewsSchema),
    db.select().from(postLikesSchema),
    db.select().from(siteConfigSchema),
    db.select().from(sidebarItemsSchema),
    db.select().from(homeSectionsSchema),
    db.select().from(navItemsSchema),
    db.select().from(legalPagesSchema),
    db.select().from(commentsSchema),
    db.select().from(categoryCommentSettingsSchema),
    db.select().from(customPagesSchema),
  ]);

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    tables: {
      posts: postsData,
      postTags: postTagsData,
      vibeApps: vibeAppsData,
      appReviews: appReviewsData,
      postLikes: postLikesData,
      siteConfig: siteConfigData,
      sidebarItems: sidebarItemsData,
      homeSections: homeSectionsData,
      navItems: navItemsData,
      legalPages: legalPagesData,
      comments: commentsData,
      categoryCommentSettings: categoryCommentSettingsData,
      customPages: customPagesData,
    },
  };
}

export type BackupData = Awaited<ReturnType<typeof exportAllData>>;

/** JSON 백업 데이터를 DB에 복원 (기존 데이터 삭제 후 삽입) */
export async function importAllData(data: BackupData) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const {
    postTags: postTagsTable,
    vibeApps: vibeAppsSchema,
    appReviews: appReviewsSchema,
    postLikes: postLikesSchema,
    siteConfig: siteConfigSchema,
    sidebarItems: sidebarItemsSchema,
    homeSections: homeSectionsSchema,
    navItems: navItemsSchema,
    legalPages: legalPagesSchema,
    comments: commentsSchema,
    categoryCommentSettings: categoryCommentSettingsSchema,
    customPages: customPagesSchema,
  } = await import("../drizzle/schema");

  const { sql: sqlExpr } = await import("drizzle-orm");

  await db.execute(sqlExpr`SET FOREIGN_KEY_CHECKS = 0`);
  try {
    const t = data.tables;

    // 삭제 (의존성 역순)
    await db.delete(appReviewsSchema);
    await db.delete(postLikesSchema);
    await db.delete(postTagsTable);
    await db.delete(commentsSchema);
    await db.delete(categoryCommentSettingsSchema);
    await db.delete(customPagesSchema);
    await db.delete(legalPagesSchema);
    await db.delete(navItemsSchema);
    await db.delete(homeSectionsSchema);
    await db.delete(sidebarItemsSchema);
    await db.delete(siteConfigSchema);
    await db.delete(vibeAppsSchema);
    await db.delete(posts);

    const toDate = (v: unknown) => v ? new Date(v as string) : null;

    // 삽입 (의존성 순서)
    if (t.posts?.length)
      await db.insert(posts).values(t.posts.map(r => ({
        ...r,
        createdAt: toDate(r.createdAt)!,
        updatedAt: toDate(r.updatedAt)!,
        scheduledAt: toDate(r.scheduledAt),
        pinnedAt: toDate(r.pinnedAt),
        deletedAt: toDate(r.deletedAt),
      })));
    if (t.postTags?.length)
      await db.insert(postTagsTable).values(t.postTags.map(r => ({ ...r, createdAt: toDate(r.createdAt)! })));
    if (t.vibeApps?.length)
      await db.insert(vibeAppsSchema).values(t.vibeApps.map(r => ({ ...r, createdAt: toDate(r.createdAt)!, updatedAt: toDate(r.updatedAt)! })));
    if (t.appReviews?.length)
      await db.insert(appReviewsSchema).values(t.appReviews.map(r => ({ ...r, createdAt: toDate(r.createdAt)! })));
    if (t.postLikes?.length)
      await db.insert(postLikesSchema).values(t.postLikes.map(r => ({ ...r, createdAt: toDate(r.createdAt)! })));
    if (t.siteConfig?.length)
      await db.insert(siteConfigSchema).values(t.siteConfig.map(r => ({ ...r, updatedAt: toDate(r.updatedAt)! })));
    if (t.sidebarItems?.length)
      await db.insert(sidebarItemsSchema).values(t.sidebarItems.map(r => ({ ...r, createdAt: toDate(r.createdAt)!, updatedAt: toDate(r.updatedAt)! })));
    if (t.homeSections?.length)
      await db.insert(homeSectionsSchema).values(t.homeSections.map(r => ({ ...r, updatedAt: toDate(r.updatedAt)! })));
    if (t.navItems?.length)
      await db.insert(navItemsSchema).values(t.navItems.map(r => ({ ...r, updatedAt: toDate(r.updatedAt)! })));
    if (t.legalPages?.length)
      await db.insert(legalPagesSchema).values(t.legalPages.map(r => ({ ...r, updatedAt: toDate(r.updatedAt)! })));
    if (t.comments?.length)
      await db.insert(commentsSchema).values(t.comments.map(r => ({ ...r, createdAt: toDate(r.createdAt)!, aiRepliedAt: toDate(r.aiRepliedAt) })));
    if (t.categoryCommentSettings?.length)
      await db.insert(categoryCommentSettingsSchema).values(t.categoryCommentSettings.map(r => ({ ...r, updatedAt: toDate(r.updatedAt)! })));
    if (t.customPages?.length)
      await db.insert(customPagesSchema).values(t.customPages.map(r => ({ ...r, createdAt: toDate(r.createdAt)!, updatedAt: toDate(r.updatedAt)! })));
  } finally {
    await db.execute(sqlExpr`SET FOREIGN_KEY_CHECKS = 1`);
  }

  return { success: true };
}

// ─── 백업 이력 관련 함수 ──────────────────────────────────────────────────────
import { backupHistory, type BackupHistory } from "../drizzle/schema";
import { storagePut } from "./storage";

/**
 * 전체 데이터를 S3에 저장하고 backup_history에 이력을 기록합니다.
 * @param isAuto 자동 백업 여부
 */
export async function saveBackupToS3(isAuto = false): Promise<BackupHistory> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  // 1. 전체 데이터 수집
  const data = await exportAllData();
  const json = JSON.stringify(data);
  const buffer = Buffer.from(json, "utf-8");

  // 2. S3에 업로드
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "-");
  const fileKey = `backups/blog-backup-${dateStr}-${timeStr}.json`;
  const { key, url } = await storagePut(fileKey, buffer, "application/json");

  // 3. 테이블별 건수 계산
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.tables)) {
    counts[k] = Array.isArray(v) ? v.length : 0;
  }

  // 4. 이력 DB에 저장
  await db.insert(backupHistory).values({
    fileKey: key,
    fileUrl: url,
    fileSize: buffer.byteLength,
    countsJson: JSON.stringify(counts),
    isAuto,
  });

  // 5. 최근 5개만 유지 (오래된 것 삭제)
  const allHistory = await db
    .select()
    .from(backupHistory)
    .orderBy(desc(backupHistory.createdAt));

  if (allHistory.length > 5) {
    const toDelete = allHistory.slice(5);
    for (const row of toDelete) {
      await db.delete(backupHistory).where(eq(backupHistory.id, row.id));
    }
  }

  // 6. 방금 저장한 이력 반환
  const [latest] = await db
    .select()
    .from(backupHistory)
    .orderBy(desc(backupHistory.createdAt))
    .limit(1);
  return latest;
}

/**
 * 백업 이력 목록 조회 (최신순)
 */
export async function getBackupHistory(): Promise<BackupHistory[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt));
}

/**
 * 특정 백업 이력 조회
 */
export async function getBackupById(id: number): Promise<BackupHistory | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(backupHistory).where(eq(backupHistory.id, id)).limit(1);
  return row ?? null;
}

/**
 * 선택한 테이블만 복원 (부분 복원)
 */
export async function importSelectedTables(
  data: BackupData,
  selectedTables: string[]
): Promise<{ success: boolean; restored: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const t = data.tables;
  const restored: string[] = [];

  const {
    postTags: postTagsTable2,
    vibeApps: vibeAppsSchema2,
    siteConfig: siteConfigSchema2,
    sidebarItems: sidebarItemsSchema2,
    homeSections: homeSectionsSchema2,
    navItems: navItemsSchema2,
    legalPages: legalPagesSchema2,
    comments: commentsSchema2,
    customPages: customPagesSchema2,
  } = await import("../drizzle/schema");
  const { sql: sqlExpr2 } = await import("drizzle-orm");

  await db.execute(sqlExpr2`SET FOREIGN_KEY_CHECKS = 0`);
  try {
    // 선택된 테이블만 삭제 후 재삽입
    if (selectedTables.includes("posts") && t.posts) {
      await db.delete(posts);
      if (t.posts.length) {
        await db.insert(posts).values(t.posts.map(r => ({
          ...r,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          scheduledAt: r.scheduledAt ? new Date(r.scheduledAt) : null,
          pinnedAt: r.pinnedAt ? new Date(r.pinnedAt) : null,
          deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
        })));
      }
      restored.push("posts");
    }
    if (selectedTables.includes("postTags") && t.postTags) {
      await db.execute(sqlExpr2`DELETE FROM post_tags`);
      if (t.postTags.length) {
        await db.insert(postTagsTable2).values(t.postTags.map(r => ({ ...r, createdAt: new Date(r.createdAt) })));
      }
      restored.push("postTags");
    }
    if (selectedTables.includes("siteConfig") && t.siteConfig) {
      await db.delete(siteConfigSchema2);
      if (t.siteConfig.length) {
        await db.insert(siteConfigSchema2).values(t.siteConfig.map(r => ({ ...r, updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("siteConfig");
    }
    if (selectedTables.includes("sidebarItems") && t.sidebarItems) {
      await db.delete(sidebarItemsSchema2);
      if (t.sidebarItems.length) {
        await db.insert(sidebarItemsSchema2).values(t.sidebarItems.map(r => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("sidebarItems");
    }
    if (selectedTables.includes("homeSections") && t.homeSections) {
      await db.delete(homeSectionsSchema2);
      if (t.homeSections.length) {
        await db.insert(homeSectionsSchema2).values(t.homeSections.map(r => ({ ...r, updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("homeSections");
    }
    if (selectedTables.includes("navItems") && t.navItems) {
      await db.delete(navItemsSchema2);
      if (t.navItems.length) {
        await db.insert(navItemsSchema2).values(t.navItems.map(r => ({ ...r, updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("navItems");
    }
    if (selectedTables.includes("legalPages") && t.legalPages) {
      await db.delete(legalPagesSchema2);
      if (t.legalPages.length) {
        await db.insert(legalPagesSchema2).values(t.legalPages.map(r => ({ ...r, updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("legalPages");
    }
    if (selectedTables.includes("comments") && t.comments) {
      await db.delete(commentsSchema2);
      if (t.comments.length) {
        await db.insert(commentsSchema2).values(t.comments.map(r => ({ ...r, createdAt: new Date(r.createdAt), aiRepliedAt: r.aiRepliedAt ? new Date(r.aiRepliedAt) : null })));
      }
      restored.push("comments");
    }
    if (selectedTables.includes("customPages") && t.customPages) {
      await db.delete(customPagesSchema2);
      if (t.customPages.length) {
        await db.insert(customPagesSchema2).values(t.customPages.map(r => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("customPages");
    }
    if (selectedTables.includes("vibeApps") && t.vibeApps) {
      await db.delete(vibeAppsSchema2);
      if (t.vibeApps.length) {
        await db.insert(vibeAppsSchema2).values(t.vibeApps.map(r => ({ ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })));
      }
      restored.push("vibeApps");
    }
  } finally {
    await db.execute(sqlExpr2`SET FOREIGN_KEY_CHECKS = 1`);
  }

  return { success: true, restored };
}

// ─── 댓글 좋아요 함수 ──────────────────────────────────────────────────────────

/**
 * 댓글 또는 AI 답변에 좋아요 토글
 * - 이미 좋아요한 경우: 취소 (DELETE)
 * - 좋아요 안 한 경우: 추가 (INSERT)
 * - comments 테이블의 likeCount / aiReplyLikeCount 동기화
 */
export async function toggleCommentLike(
  commentId: number,
  userId: string,
  targetType: "comment" | "ai_reply"
): Promise<{ liked: boolean; likeCount: number; aiReplyLikeCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { commentLikes, comments } = await import("../drizzle/schema");

  // 기존 좋아요 확인
  const existing = await db.select()
    .from(commentLikes)
    .where(
      and(
        eq(commentLikes.commentId, commentId),
        eq(commentLikes.userId, userId),
        eq(commentLikes.targetType, targetType)
      )
    )
    .limit(1);

  let liked: boolean;

  if (existing.length > 0) {
    // 좋아요 취소
    await db.delete(commentLikes).where(
      and(
        eq(commentLikes.commentId, commentId),
        eq(commentLikes.userId, userId),
        eq(commentLikes.targetType, targetType)
      )
    );
    liked = false;
  } else {
    // 좋아요 추가
    await db.insert(commentLikes).values({ commentId, userId, targetType });
    liked = true;
  }

  // 카운트 재계산 후 comments 테이블 업데이트
  const [commentLikeRow] = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.targetType, "comment")));
  const [aiReplyLikeRow] = await db.select({ cnt: sql<number>`COUNT(*)` })
    .from(commentLikes)
    .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.targetType, "ai_reply")));

  const newLikeCount = Number(commentLikeRow?.cnt ?? 0);
  const newAiReplyLikeCount = Number(aiReplyLikeRow?.cnt ?? 0);

  await db.update(comments)
    .set({ likeCount: newLikeCount, aiReplyLikeCount: newAiReplyLikeCount })
    .where(eq(comments.id, commentId));

  return { liked, likeCount: newLikeCount, aiReplyLikeCount: newAiReplyLikeCount };
}

/**
 * 사용자의 댓글 좋아요 상태 일괄 조회
 * commentIds 배열에 대해 userId가 좋아요한 항목 반환
 */
export async function getCommentLikeStatuses(
  commentIds: number[],
  userId: string
): Promise<Array<{ commentId: number; targetType: "comment" | "ai_reply" }>> {
  if (!commentIds.length) return [];
  const db = await getDb();
  if (!db) return [];
  const { commentLikes } = await import("../drizzle/schema");

  const rows = await db.select({
    commentId: commentLikes.commentId,
    targetType: commentLikes.targetType,
  })
    .from(commentLikes)
    .where(
      and(
        inArray(commentLikes.commentId, commentIds),
        eq(commentLikes.userId, userId)
      )
    );

  return rows as Array<{ commentId: number; targetType: "comment" | "ai_reply" }>;
}

// ─── 후원(커피 한 잔 쏘기) DB 함수 ────────────────────────────────────────────

/** 후원 등록 */
export async function createDonation(data: {
  donorName: string;
  amount: number;
  message?: string | null;
  userId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { donations } = await import("../drizzle/schema");
  await db.insert(donations).values({
    donorName: data.donorName,
    amount: data.amount,
    message: data.message ?? null,
    userId: data.userId ?? null,
    confirmed: false,
  });
}

/** 후원 목록 조회 (관리자용) */
export async function listDonations(opts: { limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const { donations } = await import("../drizzle/schema");
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const [items, countRows] = await Promise.all([
    db.select().from(donations).orderBy(desc(donations.createdAt)).limit(limit).offset(offset),
    db.select({ count: count() }).from(donations),
  ]);
  return { items, total: countRows[0]?.count ?? 0 };
}

/** 후원 확인 처리 (관리자) */
export async function confirmDonation(id: number, adminMemo?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { donations } = await import("../drizzle/schema");
  await db.update(donations)
    .set({ confirmed: true, ...(adminMemo !== undefined && { adminMemo }) })
    .where(eq(donations.id, id));
}

/** 후원 메모 업데이트 (관리자) */
export async function updateDonationMemo(id: number, adminMemo: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { donations } = await import("../drizzle/schema");
  await db.update(donations).set({ adminMemo }).where(eq(donations.id, id));
}

/** 후원 삭제 (관리자) */
export async function deleteDonation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { donations } = await import("../drizzle/schema");
  await db.delete(donations).where(eq(donations.id, id));
}

/** 후원 설정 조회 (siteConfig 기반) */
export async function getDonationSettings() {
  const db = await getDb();
  if (!db) return null;
  const { siteConfig } = await import("../drizzle/schema");
  const rows = await db.select().from(siteConfig).where(
    inArray(siteConfig.configKey, [
      "donationEnabled",
      "donationBankName",
      "donationAccountNumber",
      "donationAccountHolder",
      "donationDescription",
      "donationKakaoId",
    ])
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.configKey] = r.configValue ?? "";
  return {
    enabled: map["donationEnabled"] === "true",
    bankName: map["donationBankName"] ?? "",
    accountNumber: map["donationAccountNumber"] ?? "",
    accountHolder: map["donationAccountHolder"] ?? "",
    description: map["donationDescription"] ?? "블로그 운영에 힘이 됩니다 ☕",
    kakaoId: map["donationKakaoId"] ?? "",
  };
}

/** 후원 설정 저장 (siteConfig 기반) */
export async function updateDonationSettings(settings: {
  enabled?: boolean;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  description?: string;
  kakaoId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { siteConfig } = await import("../drizzle/schema");
  const entries: Array<{ configKey: string; configValue: string }> = [];
  if (settings.enabled !== undefined) entries.push({ configKey: "donationEnabled", configValue: String(settings.enabled) });
  if (settings.bankName !== undefined) entries.push({ configKey: "donationBankName", configValue: settings.bankName });
  if (settings.accountNumber !== undefined) entries.push({ configKey: "donationAccountNumber", configValue: settings.accountNumber });
  if (settings.accountHolder !== undefined) entries.push({ configKey: "donationAccountHolder", configValue: settings.accountHolder });
  if (settings.description !== undefined) entries.push({ configKey: "donationDescription", configValue: settings.description });
  if (settings.kakaoId !== undefined) entries.push({ configKey: "donationKakaoId", configValue: settings.kakaoId });
  for (const entry of entries) {
    await db.insert(siteConfig).values(entry)
      .onDuplicateKeyUpdate({ set: { configValue: entry.configValue } });
  }
  cache.invalidate('siteConfig:');
}

/**
 * 백업 이력 삭제 (DB 레코드만 삭제 - S3 파일은 키 참조 제거로 사실상 접근 불가)
 */
export async function deleteBackupById(id: number): Promise<{ fileKey: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(backupHistory).where(eq(backupHistory.id, id)).limit(1);
  if (!row) throw new Error("백업 이력을 찾을 수 없습니다.");
  await db.delete(backupHistory).where(eq(backupHistory.id, id));
  return { fileKey: row.fileKey };
}

/**
 * 여러 백업 이력 일괄 삭제
 */
export async function deleteBackupsByIds(ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { inArray } = await import("drizzle-orm");
  await db.delete(backupHistory).where(inArray(backupHistory.id, ids));
}

// ─── 광고 클릭 로그 ─────────────────────────────────────────────────────────

/**
 * 광고 클릭 기록 저장
 */
export async function logAdClick(data: {
  position: string;
  slotNum?: number;
  postId?: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { adClickLogs } = await import("../drizzle/schema");
  await db.insert(adClickLogs).values({
    position: data.position,
    slotNum: data.slotNum ?? 1,
    postId: data.postId ?? null,
    clickedAt: Date.now(),
  });
}

/**
 * 광고 위치별 클릭 통계 조회 (최근 30일)
 */
export async function getAdClickStats(): Promise<{ position: string; slotNum: number; count: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const { adClickLogs } = await import("../drizzle/schema");
  const { sql: drizzleSql, gte } = await import("drizzle-orm");
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await db
    .select({
      position: adClickLogs.position,
      slotNum: adClickLogs.slotNum,
      count: drizzleSql<number>`COUNT(*)`.as("count"),
    })
    .from(adClickLogs)
    .where(gte(adClickLogs.clickedAt, since))
    .groupBy(adClickLogs.position, adClickLogs.slotNum)
    .orderBy(drizzleSql`COUNT(*) DESC`);
  return rows.map(r => ({ position: r.position, slotNum: r.slotNum, count: Number(r.count) }));
}

/**
 * 카테고리별 광고 슬롯 전체 조회
 */
export async function getCategoryAdSlots() {
  const db = await getDb();
  if (!db) return [];
  const { categoryAdSlots } = await import("../drizzle/schema");
  return db.select().from(categoryAdSlots);
}

/**
 * 특정 카테고리의 광고 슬롯 조회
 */
export async function getCategoryAdSlot(categoryKey: string) {
  const db = await getDb();
  if (!db) return null;
  const { categoryAdSlots } = await import("../drizzle/schema");
  const { eq: eqFn } = await import("drizzle-orm");
  const rows = await db.select().from(categoryAdSlots).where(eqFn(categoryAdSlots.categoryKey, categoryKey)).limit(1);
  return rows[0] ?? null;
}

/**
 * 카테고리 광고 슬롯 저장 (upsert)
 */
export async function upsertCategoryAdSlot(data: {
  categoryKey: string;
  slot1Code?: string | null;
  slot2Code?: string | null;
  slot3Code?: string | null;
  disabled?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  const { categoryAdSlots } = await import("../drizzle/schema");
  const { eq: eqFn } = await import("drizzle-orm");
  const now = Date.now();
  const existing = await getCategoryAdSlot(data.categoryKey);
  if (existing) {
    await db.update(categoryAdSlots)
      .set({
        slot1Code: data.slot1Code ?? null,
        slot2Code: data.slot2Code ?? null,
        slot3Code: data.slot3Code ?? null,
        disabled: data.disabled ? 1 : 0,
        updatedAt: now,
      })
      .where(eqFn(categoryAdSlots.categoryKey, data.categoryKey));
  } else {
    await db.insert(categoryAdSlots).values({
      categoryKey: data.categoryKey,
      slot1Code: data.slot1Code ?? null,
      slot2Code: data.slot2Code ?? null,
      slot3Code: data.slot3Code ?? null,
      disabled: data.disabled ? 1 : 0,
      updatedAt: now,
    });
  }
}

// ─── 보관함 자동 정리 ─────────────────────────────────────────────────────────
/**
 * 보관함에 보관된 지 30일 이상 지난 글을 완전 삭제합니다.
 * Heartbeat 스케줄러에서 매일 1회 호출됩니다.
 */
export async function purgeExpiredTrashPosts(retentionDays = 30): Promise<{ deletedCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const { isNotNull, lt } = await import("drizzle-orm");
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  // 삭제 대상 ID 먼저 조회
  const targets = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(isNotNull(posts.deletedAt), lt(posts.deletedAt, cutoff)));
  if (targets.length === 0) return { deletedCount: 0 };
  const { inArray } = await import("drizzle-orm");
  const ids = targets.map(t => t.id);
  await db.delete(posts).where(inArray(posts.id, ids));
  cache.invalidate('posts:');
  return { deletedCount: ids.length };
}

export async function deleteApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

export async function reactivateApiKey(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db
    .update(apiKeys)
    .set({ active: true })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
}

/**
 * 이전 슬러그로 현재 게시글의 정규 슬러그를 찾습니다 (301 리디렉션용).
 * slug_history 테이블에서 oldSlug를 조회하여 해당 게시글의 현재 customSlug 또는 slug를 반환합니다.
 * 반환값이 null이면 리디렉션 대상 없음.
 */
export async function findRedirectTarget(oldSlug: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({ postId: slugHistory.postId })
      .from(slugHistory)
      .where(eq(slugHistory.oldSlug, oldSlug))
      .limit(1);
    if (!rows.length) return null;
    const post = await getPostById(rows[0].postId);
    if (!post || !post.published) return null;
    // customSlug 우선, 없으면 자동 slug 사용
    return (post as any).customSlug || post.slug || null;
  } catch {
    return null;
  }
}

// ─── 파일 메타데이터 헬퍼 ─────────────────────────────────────────────────────

/**
 * 파일 업로드 시 원본 파일명을 DB에 저장합니다.
 * storageProxy가 URL 파라미터 대신 DB에서 파일명을 조회하여 Content-Disposition 헤더에 사용합니다.
 */
export async function saveFileMetadata(
  fileKey: string,
  originalFilename: string,
  fileSize: number = 0,
  mimeType?: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[FileMetadata] DB not available, skipping metadata save");
    return;
  }
  try {
    const { fileMetadata } = await import("../drizzle/schema");
    await db.insert(fileMetadata).values({
      fileKey,
      originalFilename,
      fileSize,
      mimeType: mimeType ?? null,
    }).onDuplicateKeyUpdate({
      set: { originalFilename, fileSize, mimeType: mimeType ?? null },
    });
  } catch (err) {
    console.error("[FileMetadata] Failed to save metadata:", err);
  }
}

/**
 * S3 key로 원본 파일명을 조회합니다.
 * 없으면 null 반환.
 */
export async function getOriginalFilename(fileKey: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const { fileMetadata } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ originalFilename: fileMetadata.originalFilename })
      .from(fileMetadata)
      .where(eq(fileMetadata.fileKey, fileKey))
      .limit(1);
    return rows[0]?.originalFilename ?? null;
  } catch (err) {
    console.error("[FileMetadata] Failed to get filename:", err);
    return null;
  }
}

/**
 * [LEGACY] 프록시 API 키를 저장합니다 (upsert) - 하위 호환성 유지
 * 새 코드는 createProxyApiKey / getProxyApiKeyForPage를 사용하세요
 */
export async function setProxyApiKey(keyName: string, keyValue: string): Promise<void> {
  // 레거시: ENV 키 이름으로 등록 (keyType = keyName, label = keyName)
  await createProxyApiKey({ keyType: keyName, label: keyName, keyValue });
}

/**
 * [LEGACY] 프록시 API 키를 조회합니다 - 하위 호환성 유지
 * 없으면 null 반환.
 */
export async function getProxyApiKey(keyType: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const { proxyApiKeys } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ keyValue: proxyApiKeys.keyValue })
      .from(proxyApiKeys)
      .where(eq(proxyApiKeys.keyType, keyType))
      .limit(1);
    return rows[0]?.keyValue ?? null;
  } catch (err) {
    console.error("[ProxyApiKey] Failed to get key:", err);
    return null;
  }
}

/**
 * [LEGACY] 프록시 API 키가 존재하는지 확인합니다 (값은 반환하지 않음).
 */
export async function hasProxyApiKey(keyType: string): Promise<boolean> {
  const key = await getProxyApiKey(keyType);
  return key !== null && key.length > 0;
}

/**
 * [LEGACY] 프록시 API 키를 삭제합니다 (ENV 키로 폴백).
 */
export async function deleteProxyApiKey(keyType: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyApiKeys } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(proxyApiKeys).where(eq(proxyApiKeys.keyType, keyType));
}

/**
 * [LEGACY] 모든 프록시 API 키 목록을 반환합니다 (값은 마스킹).
 */
export async function listProxyApiKeys(): Promise<{ keyName: string; maskedValue: string; updatedAt: number; source: "db" | "env" }[]> {
  const keys = await listAllProxyApiKeys();
  const keyTypes = ["gemini", "google"] as const;
  const result: { keyName: string; maskedValue: string; updatedAt: number; source: "db" | "env" }[] = [];
  for (const keyType of keyTypes) {
    const dbKey = keys.find(k => k.keyType === keyType);
    if (dbKey) {
      result.push({ keyName: keyType, maskedValue: dbKey.maskedValue, updatedAt: dbKey.updatedAt, source: "db" });
    } else {
      const envVal = keyType === "gemini" ? ENV.geminiApiKey : ENV.googleApiKey;
      result.push({ keyName: keyType, maskedValue: envVal ? (envVal.length > 4 ? "****" + envVal.slice(-4) : "****") : "", updatedAt: 0, source: "env" });
    }
  }
  return result;
}

// ─── 다중 키 시스템 신규 API ─────────────────────────────────────────────────────

export type ProxyApiKeyRow = {
  id: number;
  keyType: string;
  label: string;
  maskedValue: string;
  createdAt: number;
  updatedAt: number;
  connectedPages: Array<{ id: number; title: string; slug: string }>;
};

/** 신규 API 키 등록 */
export async function createProxyApiKey(data: { keyType: string; label: string; keyValue: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyApiKeys } = await import("../drizzle/schema");
  const now = Date.now();
  const [result] = await db.insert(proxyApiKeys).values({
    keyType: data.keyType,
    label: data.label,
    keyValue: data.keyValue,
    createdAt: now,
    updatedAt: now,
  });
  return (result as any).insertId;
}

/** API 키 수정 (레이블, 키 값 변경) */
export async function updateProxyApiKey(id: number, data: { label?: string; keyValue?: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyApiKeys } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (data.label !== undefined) updates.label = data.label;
  if (data.keyValue !== undefined) updates.keyValue = data.keyValue;
  await db.update(proxyApiKeys).set(updates).where(eq(proxyApiKeys.id, id));
}

/** API 키 삭제 (ID 기반) */
export async function deleteProxyApiKeyById(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyApiKeys, proxyKeyPageLinks } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  // 연결 링크도 함께 삭제
  await db.delete(proxyKeyPageLinks).where(eq(proxyKeyPageLinks.keyId, id));
  await db.delete(proxyApiKeys).where(eq(proxyApiKeys.id, id));
}

/** 모든 API 키 목록 (연결 페이지 포함) */
export async function listAllProxyApiKeys(): Promise<ProxyApiKeyRow[]> {
  const db = await getDb();
  if (!db) return [];
  const { proxyApiKeys, proxyKeyPageLinks, customPages } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const keys = await db.select().from(proxyApiKeys).orderBy(proxyApiKeys.createdAt);
  const result: ProxyApiKeyRow[] = [];
  for (const k of keys) {
    const links = await db
      .select({ pageId: proxyKeyPageLinks.pageId })
      .from(proxyKeyPageLinks)
      .where(eq(proxyKeyPageLinks.keyId, k.id));
    const pageIds = links.map(l => l.pageId);
    const pages: Array<{ id: number; title: string; slug: string }> = [];
    for (const pid of pageIds) {
      const rows = await db.select({ id: customPages.id, title: customPages.title, slug: customPages.slug })
        .from(customPages).where(eq(customPages.id, pid)).limit(1);
      if (rows[0]) pages.push(rows[0]);
    }
    const v = k.keyValue;
    result.push({
      id: k.id,
      keyType: k.keyType,
      label: k.label,
      maskedValue: v.length > 4 ? "****" + v.slice(-4) : "****",
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
      connectedPages: pages,
    });
  }
  return result;
}

/** 페이지에 API 키 연결 */
export async function linkProxyKeyToPage(keyId: number, pageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyKeyPageLinks } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  // 중복 링크 방지
  const existing = await db.select({ id: proxyKeyPageLinks.id })
    .from(proxyKeyPageLinks)
    .where(and(eq(proxyKeyPageLinks.keyId, keyId), eq(proxyKeyPageLinks.pageId, pageId)))
    .limit(1);
  if (existing.length > 0) return;
  await db.insert(proxyKeyPageLinks).values({ keyId, pageId, createdAt: Date.now() });
}

/** 페이지에서 API 키 연결 해제 */
export async function unlinkProxyKeyFromPage(keyId: number, pageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { proxyKeyPageLinks } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  await db.delete(proxyKeyPageLinks)
    .where(and(eq(proxyKeyPageLinks.keyId, keyId), eq(proxyKeyPageLinks.pageId, pageId)));
}

/**
 * 페이지 slug로 연결된 API 키 값 조회 (keyType 필터)
 * api-proxy.ts에서 페이지별 키 조회에 사용
 */
export async function getProxyApiKeyForPage(pageSlug: string, keyType: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const { proxyApiKeys, proxyKeyPageLinks, customPages } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    // 페이지 ID 조회
    const pageRows = await db.select({ id: customPages.id })
      .from(customPages).where(eq(customPages.slug, pageSlug)).limit(1);
    if (!pageRows[0]) return null;
    const pageId = pageRows[0].id;
    // 타입이 일치하는 연결된 키 조회
    const rows = await db
      .select({ keyValue: proxyApiKeys.keyValue })
      .from(proxyApiKeys)
      .innerJoin(proxyKeyPageLinks, and(
        eq(proxyKeyPageLinks.keyId, proxyApiKeys.id),
        eq(proxyKeyPageLinks.pageId, pageId)
      ))
      .where(eq(proxyApiKeys.keyType, keyType))
      .limit(1);
    return rows[0]?.keyValue ?? null;
  } catch (err) {
    console.error("[ProxyApiKey] getProxyApiKeyForPage error:", err);
    return null;
  }
}

/**
 * 페이지에 연결된 모든 API 키를 keyType별로 반환합니다.
 * youtube 타입은 최대 2개, 나머지는 최대 1개 반환.
 * page-html-serve에서 HTML 앱에 키를 자동 주입할 때 사용합니다.
 */
export async function getPageLinkedKeys(pageSlug: string): Promise<{
  youtube: string[];
  gemini: string | null;
  google: string | null;
}> {
  const db = await getDb();
  const result = { youtube: [] as string[], gemini: null as string | null, google: null as string | null };
  if (!db) return result;
  try {
    const { proxyApiKeys, proxyKeyPageLinks, customPages } = await import("../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const pageRows = await db.select({ id: customPages.id })
      .from(customPages).where(eq(customPages.slug, pageSlug)).limit(1);
    if (!pageRows[0]) return result;
    const pageId = pageRows[0].id;
    const rows = await db
      .select({ keyType: proxyApiKeys.keyType, keyValue: proxyApiKeys.keyValue })
      .from(proxyApiKeys)
      .innerJoin(proxyKeyPageLinks, and(
        eq(proxyKeyPageLinks.keyId, proxyApiKeys.id),
        eq(proxyKeyPageLinks.pageId, pageId)
      ));
    for (const row of rows) {
      if (row.keyType === 'youtube' && result.youtube.length < 2) {
        result.youtube.push(row.keyValue);
      } else if (row.keyType === 'gemini' && !result.gemini) {
        result.gemini = row.keyValue;
      } else if (row.keyType === 'google' && !result.google) {
        result.google = row.keyValue;
      }
    }
    return result;
  } catch (err) {
    console.error("[ProxyApiKey] getPageLinkedKeys error:", err);
    return result;
  }
}

/** 임시저장(draft) 상태인 게시물 전체 영구 삭제 */
export async function deleteAllDrafts() {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // 삭제 전 개수 파악
  const countRows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.status, "draft"));
  const count = countRows.length;
  if (count === 0) return { success: true, count: 0 };
  await db.delete(posts).where(eq(posts.status, "draft"));
  return { success: true, count };
}

// ─── 키워드 유사도 기반 관련글 ────────────────────────────────────────────────
/**
 * 제목 + 본문 텍스트에서 한국어/영어 키워드를 추출하고
 * TF(단어 빈도) 기반 코사인 유사도로 관련 게시물을 정렬한다.
 *
 * 알고리즘:
 * 1. 현재 글의 제목(가중치 3x) + excerpt(가중치 2x) + 본문 텍스트에서 키워드 벡터 생성
 * 2. 후보 게시물(같은 카테고리 우선, 부족하면 전체)의 제목+excerpt+본문으로 벡터 생성
 * 3. 코사인 유사도 계산 후 내림차순 정렬
 * 4. 상위 limit개 반환
 */
export async function getRelatedBySimilarity(
  postId: number,
  category: string,
  title: string,
  content: string,
  excerpt: string | null,
  limit = 3
): Promise<{
  id: number;
  title: string;
  excerpt: string | null;
  thumbnail: string | null;
  category: string | null;
  tag: string | null;
  badge: string | null;
  views: number | null;
  likes: number | null;
  slug: string | null;
  createdAt: Date | null;
  score?: number;
}[]> {
  const cacheKey = `related:sim:${postId}:${limit}`;
  return cache.get(cacheKey, async () => {
    const db = await getDb();
    if (!db) return [];

    const selectFields = {
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      content: posts.content,
      thumbnail: posts.thumbnail,
      category: posts.category,
      tag: posts.tag,
      badge: posts.badge,
      views: posts.views,
      likes: posts.likes,
      slug: posts.slug,
      createdAt: posts.createdAt,
    };

    // 후보 게시물 가져오기: 전체 게시물 최대 120개 (카테고리 무관하게 유사도 계산)
    const candidates: any[] = await db
      .select(selectFields)
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.status, 'published'),
        sql`${posts.id} != ${postId}`
      ))
      .orderBy(desc(posts.createdAt))
      .limit(120);

    if (candidates.length === 0) return [];

    // HTML 태그 및 특수문자 제거 후 텍스트 추출
    function extractText(html: string): string {
      return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-zA-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    // 한국어 2-3글자 n-gram + 영어 단어 토큰화
    function tokenize(text: string): string[] {
      const tokens: string[] = [];
      // 영어 단어 (3글자 이상)
      const engWords = text.match(/[a-z]{3,}/g) || [];
      tokens.push(...engWords);
      // 한국어 2-gram
      const korText = text.replace(/[a-z0-9\s]/g, '');
      for (let i = 0; i < korText.length - 1; i++) {
        const bigram = korText.slice(i, i + 2);
        if (bigram.length === 2) tokens.push(bigram);
      }
      // 한국어 3-gram
      for (let i = 0; i < korText.length - 2; i++) {
        const trigram = korText.slice(i, i + 3);
        if (trigram.length === 3) tokens.push(trigram);
      }
      return tokens;
    }

    // TF 벡터 생성
    function buildTFVector(tokens: string[]): Map<string, number> {
      const freq = new Map<string, number>();
      tokens.forEach(t => {
        freq.set(t, (freq.get(t) ?? 0) + 1);
      });
      // 정규화
      const total = tokens.length || 1;
      const tf = new Map<string, number>();
      Array.from(freq.entries()).forEach(([k, v]) => {
        tf.set(k, v / total);
      });
      return tf;
    }

    // 코사인 유사도
    function cosineSim(a: Map<string, number>, b: Map<string, number>): number {
      let dot = 0, normA = 0, normB = 0;
      Array.from(a.entries()).forEach(([k, va]) => {
        const vb = b.get(k) ?? 0;
        dot += va * vb;
        normA += va * va;
      });
      Array.from(b.values()).forEach(vb => {
        normB += vb * vb;
      });
      if (normA === 0 || normB === 0) return 0;
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // 현재 글 벡터 (제목 3x, excerpt 2x, 본문 1x)
    const currentTitleText = extractText(title);
    const currentExcerptText = extractText(excerpt ?? '');
    const currentBodyText = extractText(content).slice(0, 3000); // 본문 최대 3000자
    const currentTokens = [
      ...tokenize(currentTitleText), ...tokenize(currentTitleText), ...tokenize(currentTitleText),
      ...tokenize(currentExcerptText), ...tokenize(currentExcerptText),
      ...tokenize(currentBodyText),
    ];
    const currentVec = buildTFVector(currentTokens);

    // 후보 게시물 점수 계산
    const scored = candidates.map((c: any) => {
      const cTitleText = extractText(c.title ?? '');
      const cExcerptText = extractText(c.excerpt ?? '');
      const cBodyText = extractText(c.content ?? '').slice(0, 3000);
      const cTokens = [
        ...tokenize(cTitleText), ...tokenize(cTitleText), ...tokenize(cTitleText),
        ...tokenize(cExcerptText), ...tokenize(cExcerptText),
        ...tokenize(cBodyText),
      ];
      const cVec = buildTFVector(cTokens);
      const score = cosineSim(currentVec, cVec);
      // 같은 카테고리 보너스 (+0.05)
      const categoryBonus = c.category === category ? 0.05 : 0;
      return { ...c, score: score + categoryBonus };
    });

    // 점수 내림차순 정렬 후 상위 limit개
    scored.sort((a: any, b: any) => b.score - a.score);
    const top = scored.slice(0, limit);

    // content 필드 제거 (클라이언트에 불필요)
    return top.map(({ content: _c, score, ...rest }: any) => ({ ...rest, score }));
  }, TTL.MEDIUM);
}

/**
 * 관리자용: 모든 태그의 SEO 현황 조회 (글 수, noindex 여부)
 * 이메일 형식 또는 특수문자만으로 구성된 태그는 noindex 대상으로 표시
 */
export async function getTagSeoStats(): Promise<{
  tag: string;
  postCount: number;
  isNoindex: boolean;
  reason: string;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  const rows = await db
    .select({
      tag: postTags.tag,
      count: count(postTags.id),
    })
    .from(postTags)
    .innerJoin(posts, and(eq(postTags.postId, posts.id), eq(posts.published, true), isNull(posts.deletedAt)))
    .groupBy(postTags.tag)
    .orderBy(desc(count(postTags.id)));

  // 발행된 글이 없는 태그도 포함 (post_tags에 있지만 published 글이 없는 경우)
  const allTagRows = await db
    .select({ tag: postTags.tag })
    .from(postTags)
    .groupBy(postTags.tag);

  const countMap = new Map(rows.map(r => [r.tag, Number(r.count)]));

  return allTagRows.map(r => {
    const postCount = countMap.get(r.tag) ?? 0;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.tag);
    const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(r.tag) || r.tag.startsWith('#');
    const isNoindex = postCount === 0 || isEmail || isSpecialOnly;
    let reason = '';
    if (isEmail) reason = '이메일 형식';
    else if (isSpecialOnly) reason = '특수문자 태그';
    else if (postCount === 0) reason = '글 없음';
    return { tag: r.tag, postCount, isNoindex, reason };
  }).sort((a, b) => {
    // noindex 대상 먼저, 그 다음 글 수 내림차순
    if (a.isNoindex !== b.isNoindex) return a.isNoindex ? -1 : 1;
    return b.postCount - a.postCount;
  });
}

/**
 * 관리자용: 모든 카테고리의 SEO 현황 조회 (글 수, noindex 여부)
 * 글이 0개인 카테고리 또는 이메일/특수문자 카테고리는 noindex 대상으로 표시
 */
export async function getCategorySeoStats(): Promise<{
  category: string;
  postCount: number;
  isNoindex: boolean;
  reason: string;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  const rows = await db
    .select({
      category: posts.category,
      count: count(posts.id),
    })
    .from(posts)
    .where(and(eq(posts.published, true), isNull(posts.deletedAt)))
    .groupBy(posts.category)
    .orderBy(desc(count(posts.id)));

  return rows
    .filter(r => r.category !== null)
    .map(r => {
      const cat = r.category as string;
      const postCount = Number(r.count);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cat);
      const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(cat);
      const isInternal = cat === '__latest__' || cat.startsWith('__');
      const isNoindex = postCount === 0 || isEmail || isSpecialOnly || isInternal;
      let reason = '';
      if (isEmail) reason = '이메일 형식';
      else if (isSpecialOnly) reason = '특수문자 카테고리';
      else if (isInternal) reason = '내부 시스템 코드';
      else if (postCount === 0) reason = '글 없음';
      return { category: cat, postCount, isNoindex, reason };
    }).sort((a, b) => {
      if (a.isNoindex !== b.isNoindex) return a.isNoindex ? -1 : 1;
      return b.postCount - a.postCount;
    });
}

/**
 * 관리자용: 문제 있는 태그 일괄 삭제 (이메일 형식, 특수문자, 글 없는 태그)
 * dryRun=true이면 삭제 대상만 반환하고 실제 삭제는 하지 않음
 */
export async function cleanupProblemTags(dryRun = true): Promise<{
  deleted: string[];
  count: number;
}> {
  const db = await getDb();
  if (!db) return { deleted: [], count: 0 };
  const { isNull, notInArray } = await import("drizzle-orm");

  // 발행된 글과 연결된 태그 목록
  const linkedRows = await db
    .select({ tag: postTags.tag })
    .from(postTags)
    .innerJoin(posts, and(eq(postTags.postId, posts.id), eq(posts.published, true), isNull(posts.deletedAt)))
    .groupBy(postTags.tag);
  const linkedTags = new Set(linkedRows.map(r => r.tag));

  // 전체 태그 목록
  const allTagRows = await db.select({ tag: postTags.tag }).from(postTags).groupBy(postTags.tag);

  const toDelete = allTagRows
    .map(r => r.tag)
    .filter(tag => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tag);
      const isSpecialOnly = /^[$@%^*=<>|\\!~`]+$/.test(tag) || tag.startsWith('#');
      const hasNoPosts = !linkedTags.has(tag);
      return isEmail || isSpecialOnly || hasNoPosts;
    });

  if (!dryRun && toDelete.length > 0) {
    await db.delete(postTags).where(
      notInArray(postTags.tag, Array.from(linkedTags))
    );
  }

  return { deleted: toDelete, count: toDelete.length };
}

// ─── 닉네임(username) 관련 쿼리 ──────────────────────────────────────────────

/**
 * 사용자의 username(닉네임)을 설정합니다.
 * username은 2~20자, 한글/영문/숫자/언더스코어만 허용합니다.
 */
export async function setUsername(userId: number, username: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ username }).where(eqTop(users.id, userId));
}

/**
 * username 중복 여부를 확인합니다.
 * @returns true = 사용 가능, false = 이미 사용 중
 */
export async function checkUsernameAvailable(username: string, excludeUserId?: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (rows.length === 0) return true;
  // 자기 자신이면 사용 가능
  if (excludeUserId !== undefined && rows[0].id === excludeUserId) return true;
  return false;
}

// ─── 개발자 등록 및 프로필 업데이트 ──────────────────────────────────────────
/**
 * 사용자를 개발자로 등록합니다.
 * bio, profileImage를 함께 저장합니다.
 */
export async function registerAsDeveloper(
  userId: number,
  data: { bio?: string; profileImage?: string }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({
    isDeveloper: true,
    developerRegisteredAt: new Date(),
    bio: data.bio ?? null,
    profileImage: data.profileImage ?? null,
  }).where(eqTop(users.id, userId));
}

/**
 * 사용자 프로필(bio, profileImage)을 업데이트합니다.
 */
export async function updateUserProfile(
  userId: number,
  data: { bio?: string | null; profileImage?: string | null }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Record<string, unknown> = {};
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.profileImage !== undefined) updateData.profileImage = data.profileImage;
  if (Object.keys(updateData).length === 0) return;
  await db.update(users).set(updateData).where(eqTop(users.id, userId));
}


/**
 * 관리자용: 글 SEO 감사 — title 길이, customSlug 미설정, 조회수 높은 글 우선
 */
export async function getPostSeoAudit(): Promise<{
  id: number;
  title: string;
  category: string;
  slug: string | null;
  customSlug: string | null;
  views: number;
  createdAt: Date;
  issues: string[];
  score: number;
}[]> {
  const db = await getDb();
  if (!db) return [];
  const { isNull } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      category: posts.category,
      slug: posts.slug,
      customSlug: posts.customSlug,
      views: posts.views,
      createdAt: posts.createdAt,
    })
    .from(posts)
    .where(and(eq(posts.published, true), isNull(posts.deletedAt)))
    .orderBy(desc(posts.views))
    .limit(200);

  return rows.map(row => {
    const issues: string[] = [];
    let score = 100;
    if (row.title.length < 10) { issues.push('제목 너무 짧음 (10자 미만)'); score -= 20; }
    else if (row.title.length > 60) { issues.push('제목 너무 긺 (60자 초과)'); score -= 10; }
    if (!row.customSlug) { issues.push('SEO 슬러그 미설정'); score -= 15; }
    if (row.views > 100 && issues.length > 0) score -= 10;
    return { ...row, issues, score: Math.max(0, score) };
  }).sort((a, b) => {
    if (a.issues.length !== b.issues.length) return b.issues.length - a.issues.length;
    return b.views - a.views;
  });
}

/**
 * 관리자용: 전체 SEO 개요 통계
 */
export async function getSeoOverview(): Promise<{
  totalPosts: number;
  publishedPosts: number;
  postsWithCustomSlug: number;
  postsWithShortTitle: number;
  postsWithLongTitle: number;
  totalTags: number;
  noindexTags: number;
  totalCategories: number;
  noindexCategories: number;
  topViewPosts: { id: number; title: string; views: number; slug: string | null; customSlug: string | null }[];
}> {
  const db = await getDb();
  if (!db) return {
    totalPosts: 0, publishedPosts: 0, postsWithCustomSlug: 0,
    postsWithShortTitle: 0, postsWithLongTitle: 0,
    totalTags: 0, noindexTags: 0, totalCategories: 0, noindexCategories: 0,
    topViewPosts: [],
  };
  const { isNull, isNotNull } = await import("drizzle-orm");

  const [totalRow] = await db.select({ c: count(posts.id) }).from(posts).where(isNull(posts.deletedAt));
  const [publishedRow] = await db.select({ c: count(posts.id) }).from(posts).where(and(eq(posts.published, true), isNull(posts.deletedAt)));
  const [slugRow] = await db.select({ c: count(posts.id) }).from(posts).where(and(eq(posts.published, true), isNull(posts.deletedAt), isNotNull(posts.customSlug)));

  const topViewPosts = await db
    .select({ id: posts.id, title: posts.title, views: posts.views, slug: posts.slug, customSlug: posts.customSlug })
    .from(posts)
    .where(and(eq(posts.published, true), isNull(posts.deletedAt)))
    .orderBy(desc(posts.views))
    .limit(5);

  const tagStats = await getTagSeoStats();
  const catStats = await getCategorySeoStats();

  const allPosts = await db
    .select({ title: posts.title })
    .from(posts)
    .where(and(eq(posts.published, true), isNull(posts.deletedAt)));

  const postsWithShortTitle = allPosts.filter(p => p.title.length < 10).length;
  const postsWithLongTitle = allPosts.filter(p => p.title.length > 60).length;

  return {
    totalPosts: Number(totalRow.c),
    publishedPosts: Number(publishedRow.c),
    postsWithCustomSlug: Number(slugRow.c),
    postsWithShortTitle,
    postsWithLongTitle,
    totalTags: tagStats.length,
    noindexTags: tagStats.filter(t => t.isNoindex).length,
    totalCategories: catStats.length,
    noindexCategories: catStats.filter(c => c.isNoindex).length,
    topViewPosts,
  };
}
