import { int, bigint, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, boolean, tinyint, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "sub_admin"]).default("user").notNull(),
  isOwner: boolean("isOwner").default(false).notNull(), // 최고 관리자(사이트 소유자) 여부
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  agreedToTerms: boolean("agreedToTerms").default(false).notNull(),
  agreedAt: timestamp("agreedAt"),
  // 권한 설정
  canWrite: boolean("canWrite").default(true).notNull(),       // 글쓰기 권한 (기본 true, 관리자가 특정 회원 차단 가능)
  canDownload: boolean("canDownload").default(true).notNull(), // 다운로드 권한
  memo: text("memo"),                                          // 관리자 메모
  isBanned: boolean("isBanned").default(false).notNull(),      // 차단 여부
  username: varchar("username", { length: 50 }),               // 사이트 내 닉네임 (첫 로그인 시 직접 설정)
  isDeveloper: boolean("isDeveloper").default(false).notNull(),               // 개발자 등록 여부
  developerRegisteredAt: timestamp("developerRegisteredAt"),                    // 개발자 등록일
  isFeaturedDeveloper: boolean("isFeaturedDeveloper").default(false).notNull(), // 주목 개발자 여부
  featuredOrder: int("featuredOrder").default(0).notNull(),      // 주목 개발자 표시 순서
  bio: text("bio"),                                               // 자기소개 (주목 개발자 섹션 표시용)
  profileImage: varchar("profileImage", { length: 500 }),        // 프로필 이미지 URL
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 게시물 테이블
export const posts = mysqlTable("posts", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  excerpt: text("excerpt"),
  content: mediumtext("content").notNull(),
  thumbnail: varchar("thumbnail", { length: 500 }),
  category: varchar("category", { length: 50 }).notNull(), // navItems에서 동적으로 관리되는 카테고리 키
  tag: varchar("tag", { length: 50 }),
  badge: varchar("badge", { length: 30 }),
  authorId: int("authorId").notNull(),
  views: int("views").default(0).notNull(),
  likes: int("likes").default(0).notNull(),
  published: boolean("published").default(true).notNull(),
  status: mysqlEnum("status", ["draft", "published"]).default("published").notNull(),
  scheduledAt: timestamp("scheduledAt"),  // 예약 발행 시각 (null이면 즉시 발행)
  isPinned: boolean("isPinned").default(false).notNull(),  // 메인 고정글 여부
  pinnedAt: timestamp("pinnedAt"),  // 고정 설정 시각 (정렬용)
  slug: varchar("slug", { length: 300 }),  // SEO URL 슬러그 (예: 바이브-코딩-입문-20260510)
  deletedAt: timestamp("deletedAt"),  // 소프트 삭제 (보관함 이동 시각, null이면 정상)
  isHtmlSource: boolean("isHtmlSource").default(false).notNull(),  // HTML 소스 탭으로 작성된 글 여부
  isAppMode: boolean("isAppMode").default(false).notNull(),  // JS가 동작하는 HTML 앱 모드 (iframe 렌더링)
  appEmbedUrl: varchar("appEmbedUrl", { length: 1000 }),  // URL 임베드 모드일 때 외부 URL
  embedWidth: mysqlEnum("embedWidth", ["content", "full"]).default("content").notNull(),  // 앱 임베드 표시 너비 (content: 본문 너비, full: 전체 화면 너비)
  showInSection: boolean("showInSection").default(true).notNull(),  // 홈 메인 섹션/최신 글 목록에 표시 여부 (false면 페이지 전용 글로 홈에서 숨김)
  allowComments: boolean("allowComments").default(true).notNull(),  // 댓글 사용 여부 (기본: 허용)
  coupangKeywords: text("coupangKeywords"),  // 글별 쿠팡 키워드 (선택적, JSON 배열 문자열)
  disableAds: boolean("disableAds").default(false).notNull(),  // 이 글에서 광고 비활성화 여부 (공지사항 등)
  enableToc: boolean("enableToc").default(false).notNull(),  // 목차(TOC) 자동 생성 여부
  customSlug: varchar("customSlug", { length: 255 }),  // SEO 최적화용 영문 슬러그 (직접 입력, 선택적)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 카테고리별 게시물 목록 조회 최적화 (category + published + deletedAt + isPinned + createdAt)
  categoryPublishedIdx: index("idx_posts_cat_pub_del_pin_created").on(
    table.category, table.published, table.deletedAt, table.isPinned, table.createdAt
  ),
  // 전체 게시물 목록 조회 최적화 (published + deletedAt + createdAt)
  publishedCreatedIdx: index("idx_posts_pub_del_created").on(
    table.published, table.deletedAt, table.createdAt
  ),
  // 조회수 정렬 최적화
  viewsIdx: index("idx_posts_views").on(table.views),
  // slug 조회 최적화
  slugIdx: index("idx_posts_slug").on(table.slug),
  customSlugIdx: index("idx_posts_custom_slug").on(table.customSlug),
}));

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;

// 게시물 태그 테이블 (다중 태그 지원)
export const postTags = mysqlTable("post_tags", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  tag: varchar("tag", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PostTag = typeof postTags.$inferSelect;
export type InsertPostTag = typeof postTags.$inferInsert;

// 바이브코딩 앱 테이블
export const vibeApps = mysqlTable("vibe_apps", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  longDescription: text("longDescription"),
  category: varchar("category", { length: 50 }),
  techStack: text("techStack"),
  features: text("features"),
  howToUse: text("howToUse"),
  /** 앱 웹사이트 URL (https://myapp.com 등) */
  appUrl: varchar("appUrl", { length: 500 }),
  /** 앱 실행 파일 다운로드 URL (S3 저장 파일) */
  downloadUrl: varchar("downloadUrl", { length: 500 }),
  /** 업로드 시 원본 파일명 (다운로드 시 Content-Disposition에 사용) */
  originalFilename: varchar("originalFilename", { length: 500 }),
  thumbnail: varchar("thumbnail", { length: 500 }),
  gradient: varchar("gradient", { length: 200 }),
  downloads: int("downloads").default(0).notNull(),
  ratingSum: int("ratingSum").default(0).notNull(),
  ratingCount: int("ratingCount").default(0).notNull(),
  /** 좋아요 수 */
  likeCount: int("likeCount").default(0).notNull(),
  /** 조회수 */
  viewCount: int("viewCount").default(0).notNull(),
  authorId: int("authorId").notNull(),
  published: boolean("published").default(true).notNull(),
  /** 신청 상태: pending=검토중, approved=승인됨, rejected=거절됨, direct=관리자 직접 등록 */
  submissionStatus: mysqlEnum("submissionStatus", ["pending", "approved", "rejected", "direct"]).default("direct").notNull(),
  /** 신청자 userId (일반 사용자 신청 시) */
  submittedBy: int("submittedBy"),
  /** 거절 사유 */
  rejectionReason: text("rejectionReason"),
  /** PC용 앱 파일 다운로드 URL */
  pcDownloadUrl: varchar("pcDownloadUrl", { length: 500 }),
  /** PC용 앱 파일 원본 파일명 */
  pcOriginalFilename: varchar("pcOriginalFilename", { length: 500 }),
  /** 모바일 앱 다운로드 URL (앱스토어/플레이스토어 링크 또는 파일) */
  mobileDownloadUrl: varchar("mobileDownloadUrl", { length: 500 }),
  /** 모바일 앱 파일 원본 파일명 */
  mobileOriginalFilename: varchar("mobileOriginalFilename", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VibeApp = typeof vibeApps.$inferSelect;
export type InsertVibeApp = typeof vibeApps.$inferInsert;

// 앱 리뷰 테이블
export const appReviews = mysqlTable("app_reviews", {
  id: int("id").autoincrement().primaryKey(),
  appId: int("appId").notNull(),
  userId: int("userId").notNull(),
  rating: int("rating").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AppReview = typeof appReviews.$inferSelect;
export type InsertAppReview = typeof appReviews.$inferInsert;

// 게시물 좋아요 테이블
export const postLikes = mysqlTable("post_likes", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PostLike = typeof postLikes.$inferSelect;

// 자동화 API 키 테이블
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  keyHash: varchar("keyHash", { length: 128 }).notNull().unique(),
  keyPrefix: varchar("keyPrefix", { length: 12 }).notNull(), // 표시용 앞 8자리
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// 사이트 전역 설정 테이블 (key-value 방식)
export const siteConfig = mysqlTable("site_config", {
  id: int("id").autoincrement().primaryKey(),
  configKey: varchar("configKey", { length: 100 }).notNull().unique(),
  configValue: text("configValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteConfig = typeof siteConfig.$inferSelect;

// 사이드바 항목 테이블
export const sidebarItems = mysqlTable("sidebar_items", {
  id: int("id").autoincrement().primaryKey(),
  side: mysqlEnum("side", ["left", "right"]).notNull(),
  itemType: mysqlEnum("itemType", ["ad", "link", "slot", "html-ad"]).notNull().default("ad"),
  title: varchar("title", { length: 100 }).default('').notNull(),
  description: text("description"),
  url: varchar("url", { length: 500 }),
  bgColor: varchar("bgColor", { length: 50 }),
  textColor: varchar("textColor", { length: 50 }),
  btnText: varchar("btnText", { length: 50 }),
  btnColor: varchar("btnColor", { length: 50 }),
  badge: varchar("badge", { length: 30 }),
  price: varchar("price", { length: 50 }),
  htmlCode: text("htmlCode"),
  sortOrder: int("sortOrder").default(0).notNull(),
  visible: boolean("visible").default(true).notNull(),
  // 메뉴 스타일 옵션 (link 타입 전용)
  menuStyle: mysqlEnum("menuStyle", ["default", "button", "pill", "underline", "card", "indent", "neon", "glass", "floating", "bold-border"]).default("default"),
  menuFontWeight: mysqlEnum("menuFontWeight", ["normal", "bold", "extrabold"]).default("normal"),
  menuBgColor: varchar("menuBgColor", { length: 50 }),
  menuBorderRadius: int("menuBorderRadius").default(8),
  menuFontSize: int("menuFontSize").default(12),
  menuHeaderHidden: boolean("menuHeaderHidden").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SidebarItem = typeof sidebarItems.$inferSelect;
export type InsertSidebarItem = typeof sidebarItems.$inferInsert;

// 홈 섹션 설정 테이블
export const homeSections = mysqlTable("home_sections", {
  id: int("id").autoincrement().primaryKey(),
  sectionKey: varchar("sectionKey", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 100 }).notNull(),
  subtitle: text("subtitle"),
  categoryPath: varchar("categoryPath", { length: 100 }),
  sortOrder: int("sortOrder").default(0).notNull(),
  visible: boolean("visible").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomeSection = typeof homeSections.$inferSelect;
export type InsertHomeSection = typeof homeSections.$inferInsert;

// 헤더 네비게이션 항목 테이블
export const navItems = mysqlTable("nav_items", {
  id: int("id").autoincrement().primaryKey(),
  label: varchar("label", { length: 50 }).notNull(),
  path: varchar("path", { length: 200 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  visible: boolean("visible").default(true).notNull(),
  // 섹션 스타일: featured(피쳐드 대형+소형 그리드), grid(소형 카드 3열), apps(앱 목록), stat-banner(스탯 배너 3열)
  sectionStyle: mysqlEnum("sectionStyle", ["featured", "grid", "apps", "latest", "overlay", "list", "list2", "stat-banner", "download-grid", "download-row", "download-card", "developers"]).default("grid").notNull(),
  // 스탯 배너 데이터 (JSON): [{mainText, subText, bgColor, linkUrl, imageUrl}] 3개 카드
  statBannerData: text("statBannerData"),
  description: varchar("description", { length: 200 }),
  bgColor: varchar("bgColor", { length: 20 }),    // 메뉴 항목 배경색 (ex: #6366f1)
  textColor: varchar("textColor", { length: 20 }), // 메뉴 항목 글자색 (ex: #ffffff)
  displayRows: int("displayRows").default(1).notNull(), // 메인 화면 섹션 표시 줄 수 (1~5)
  sectionMarginBottom: int("sectionMarginBottom").default(36), // 섹션 하단 여백 (px, 기본 36)
  thumbSize: mysqlEnum("thumbSize", ["sm", "md", "lg"]).default("md").notNull(), // 리스트 스타일 썸네일 크기
  showOnHome: boolean("showOnHome").default(true).notNull(), // 메인 화면 섹션 표시 여부
  sectionSortMode: mysqlEnum("sectionSortMode", ["latest", "popular"]).default("latest").notNull(), // 섹션 글 정렬 방식 (최신순 | 인기순)
  introHtml: text("introHtml"), // 카테고리 소개 HTML (비주얼 편집기로 편집)
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NavItem = typeof navItems.$inferSelect;
export type InsertNavItem = typeof navItems.$inferInsert;

// 정책 페이지 테이블 (개인정보처리방침, 이용약관 등)
export const legalPages = mysqlTable("legal_pages", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(), // "privacy" | "terms"
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LegalPage = typeof legalPages.$inferSelect;
export type InsertLegalPage = typeof legalPages.$inferInsert;

// 댓글 테이블
export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId"),
  pageId: int("pageId"),
  userId: varchar("userId", { length: 255 }).notNull(),
  userName: varchar("userName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isHidden: boolean("isHidden").default(false).notNull(),
  aiReply: text("aiReply"),
  aiRepliedAt: timestamp("aiRepliedAt"),
  likeCount: int("likeCount").notNull().default(0),
  aiReplyLikeCount: int("aiReplyLikeCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

// 챗봇 대화 세션 테이블 (로그인 사용자)
export const chatSessions = mysqlTable("chat_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: varchar("userId", { length: 255 }).notNull(),
  title: varchar("title", { length: 200 }).notNull().default("새 대화"),
  messages: text("messages").notNull().default("[]"), // JSON string
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;

// 조회수 상세 로그 테이블 (방문자 유형, 레퍼러 추적)
export const postViewLogs = mysqlTable("post_view_logs", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  visitorType: mysqlEnum("visitorType", ["admin", "author", "logged_in", "guest"]).notNull().default("guest"),
  referrer: varchar("referrer", { length: 500 }).default(""),
  referrerDomain: varchar("referrerDomain", { length: 200 }).default(""),
  referrerType: mysqlEnum("referrerType", ["direct", "search", "social", "internal", "external", "share"]).notNull().default("direct"),
  userAgent: varchar("userAgent", { length: 500 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PostViewLog = typeof postViewLogs.$inferSelect;
export type InsertPostViewLog = typeof postViewLogs.$inferInsert;

// 카테고리별 댓글 설정 테이블
export const categoryCommentSettings = mysqlTable("category_comment_settings", {
  id: int("id").autoincrement().primaryKey(),
  categoryKey: varchar("categoryKey", { length: 100 }).notNull().unique(),
  commentsEnabled: boolean("commentsEnabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CategoryCommentSetting = typeof categoryCommentSettings.$inferSelect;
export type InsertCategoryCommentSetting = typeof categoryCommentSettings.$inferInsert;

// 자동화 발행 로그 테이블
export const publishLogs = mysqlTable("publish_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  postId: int("postId"),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  status: mysqlEnum("status", ["published", "draft", "scheduled"]).notNull().default("published"),
  scheduledAt: timestamp("scheduledAt"),
  keyName: varchar("keyName", { length: 100 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PublishLog = typeof publishLogs.$inferSelect;
export type InsertPublishLog = typeof publishLogs.$inferInsert;

// 커스텀 페이지 테이블 (관리자가 자유롭게 만드는 페이지)
export const customPages = mysqlTable("custom_pages", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull().unique(), // URL 경로 (예: about, contact-us)
  title: varchar("title", { length: 300 }).notNull(),
  description: varchar("description", { length: 500 }).default(""),
  // 섹션 배열을 JSON 문자열로 저장 (각 섹션: id, type, content, settings)
  sectionsJson: mediumtext("sectionsJson").notNull().default("[]"),
  published: boolean("published").notNull().default(false),
  showInNav: boolean("showInNav").notNull().default(false),
  hideSidebar: boolean("hideSidebar").notNull().default(false), // 사이드바 숨김 (전체 화면 본문)
  hideChrome: boolean("hideChrome").notNull().default(false), // 헤더/카테고리/푸터 완전 숨김 (페이지 단독 전체화면)
  contentWidth: int("contentWidth").default(960), // 본문 최대 너비 (px), null이면 기본값 960
  fullscreenDefault: boolean("fullscreenDefault").notNull().default(false), // HTML 앱 섹션 기본 전체화면 여부
  showTitle: boolean("showTitle").notNull().default(true), // 페이지 제목 표시 여부
  showDescription: boolean("showDescription").notNull().default(true), // 페이지 설명 표시 여부
  titleAlign: varchar("titleAlign", { length: 10 }).default("left"), // 제목/설명 정렬: left | center | right
  postListCategory: varchar("postListCategory", { length: 100 }), // 하단 글 목록 카테고리 키 (null이면 미표시)
  commentsEnabled: boolean("commentsEnabled").notNull().default(true), // 페이지 댓글 활성화 여부
  membersOnly: boolean("membersOnly").notNull().default(false), // 회원 전용 페이지 여부
  sortOrder: int("sortOrder").notNull().default(0),
  viewCount: int("viewCount").notNull().default(0),
  // 메인 홈 섹션 배치: navItems의 카테고리 키 (예: 'ai-apps'). null이면 배치 안 함
  mainSectionKey: varchar("mainSectionKey", { length: 100 }),
  // 메인 섹션 카드 썸네일 이미지 URL (S3 경로 또는 외부 URL)
  thumbnail: varchar("thumbnail", { length: 1000 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  archivedStatus: tinyint("archived_status").notNull().default(0), // 0=active, 1=archived
  archiveMemo: varchar("archive_memo", { length: 500 }), // 보관 사유 메모 (보관함 이동 시 입력)
});
export type CustomPage = typeof customPages.$inferSelect;
export type InsertCustomPage = typeof customPages.$inferInsert;

// 페이지 업그레이드 이력 테이블 (업그레이드 전 HTML 백업)
export const pageUpgradeHistory = mysqlTable("page_upgrade_history", {
  id: int("id").autoincrement().primaryKey(),
  pageId: int("pageId").notNull(),
  pageTitle: varchar("pageTitle", { length: 300 }).notNull().default(""),
  sectionsJson: mediumtext("sectionsJson").notNull().default("[]"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  note: varchar("note", { length: 200 }).default(""),
  memo: varchar("memo", { length: 500 }),  // 사용자 입력 메모 (업그레이드 시 수정 내용 메모)
});
export type PageUpgradeHistory = typeof pageUpgradeHistory.$inferSelect;
export type InsertPageUpgradeHistory = typeof pageUpgradeHistory.$inferInsert;

// 댓글 좋아요 테이블
export const commentLikes = mysqlTable("comment_likes", {
  id: int("id").autoincrement().primaryKey(),
  commentId: int("commentId").notNull(),
  userId: varchar("userId", { length: 255 }).notNull(),
  targetType: mysqlEnum("targetType", ["comment", "ai_reply"]).notNull().default("comment"), // comment=댓글 좋아요, ai_reply=AI 답변 좋아요
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CommentLike = typeof commentLikes.$inferSelect;
export type InsertCommentLike = typeof commentLikes.$inferInsert;

// 백업 이력 테이블
export const backupHistory = mysqlTable("backup_history", {
  id: int("id").autoincrement().primaryKey(),
  /** 백업 파일 S3 키 (storagePut 반환값) */
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  /** 백업 파일 접근 URL (/manus-storage/...) */
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  /** 파일 크기 (bytes) */
  fileSize: int("fileSize").notNull().default(0),
  /** 백업 대상 테이블별 레코드 수 (JSON 문자열) */
  countsJson: text("countsJson").notNull(),
  /** 자동 백업 여부 (heartbeat 트리거) */
  isAuto: boolean("isAuto").notNull().default(false),
  /** 자동 백업 heartbeat task_uid */
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BackupHistory = typeof backupHistory.$inferSelect;
export type InsertBackupHistory = typeof backupHistory.$inferInsert;

// ─── 방문자 분석 테이블 ───────────────────────────────────────────────────────

/**
 * visitLogs: 페이지 방문 로그
 * - 방문마다 1건 기록 (페이지 이탈 시 duration 업데이트)
 * - sessionId: 브라우저 세션 단위 (sessionStorage UUID)
 */
export const visitLogs = mysqlTable("visit_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 브라우저 세션 ID (sessionStorage에서 생성한 UUID) */
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  /** 방문한 경로 (예: /, /post/123, /category/ai-tools) */
  path: varchar("path", { length: 500 }).notNull(),
  /** 게시물 ID (게시물 상세 페이지인 경우) */
  postId: int("postId"),
  /** 로그인 사용자 ID (비로그인: null) */
  userId: int("userId"),
  /** 사용자 역할 (비로그인: guest, 로그인: user/admin) */
  userRole: mysqlEnum("userRole", ["guest", "user", "admin"]).notNull().default("guest"),
  /** 디바이스 유형 (User-Agent 파싱) */
  deviceType: mysqlEnum("deviceType", ["desktop", "mobile", "tablet", "other"]).notNull().default("other"),
  /** 브라우저 (User-Agent 파싱) */
  browser: varchar("browser", { length: 50 }),
  /** OS (User-Agent 파싱) */
  os: varchar("os", { length: 50 }),
  /** 유입 경로 (Referer 헤더) */
  referrer: varchar("referrer", { length: 500 }),
  /** 유입 소스 분류 (direct/search/social/referral) */
  referrerType: mysqlEnum("referrerType", ["direct", "search", "social", "referral", "other"]).notNull().default("direct"),
  /** 검색 키워드 (검색엔진 referrer URL에서 추출, 직접 방문이면 null) */
  searchKeyword: varchar("searchKeyword", { length: 300 }),
  /** 체류 시간 (초, 페이지 이탈 시 업데이트) */
  duration: int("duration").default(0).notNull(),
  /** 최대 스크롤 깊이 (0~100%, 게시물 페이지만) */
  scrollDepth: int("scrollDepth").default(0).notNull(),
  /** 방문 시각 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type VisitLog = typeof visitLogs.$inferSelect;
export type InsertVisitLog = typeof visitLogs.$inferInsert;

/**
 * postScrollStats: 게시물별 스크롤 깊이 집계
 * - 10% 단위로 해당 깊이까지 읽은 방문자 수 집계
 * - 이탈률 분석에 활용
 */
export const postScrollStats = mysqlTable("post_scroll_stats", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  /** 10% 단위 스크롤 도달 카운트 (depth10 = 10%까지 읽은 수) */
  depth10: int("depth10").notNull().default(0),
  depth20: int("depth20").notNull().default(0),
  depth30: int("depth30").notNull().default(0),
  depth40: int("depth40").notNull().default(0),
  depth50: int("depth50").notNull().default(0),
  depth60: int("depth60").notNull().default(0),
  depth70: int("depth70").notNull().default(0),
  depth80: int("depth80").notNull().default(0),
  depth90: int("depth90").notNull().default(0),
  depth100: int("depth100").notNull().default(0),
  /** 총 방문 수 (depth10 기준) */
  totalVisits: int("totalVisits").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PostScrollStats = typeof postScrollStats.$inferSelect;
export type InsertPostScrollStats = typeof postScrollStats.$inferInsert;

// 백업 작업 진행 상태 테이블 (서버 재시작 후에도 유지)
export const backupJobs = mysqlTable("backup_jobs", {
  id: varchar("id", { length: 100 }).primaryKey(),
  progress: int("progress").notNull().default(0),
  step: varchar("step", { length: 500 }).notNull().default(''),
  done: boolean("done").notNull().default(false),
  error: text("error"),
  resultFileKey: varchar("resultFileKey", { length: 500 }),
  resultFileUrl: varchar("resultFileUrl", { length: 500 }),
  resultFileSize: int("resultFileSize"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BackupJob = typeof backupJobs.$inferSelect;
export type InsertBackupJob = typeof backupJobs.$inferInsert;

// 후원(커피 한 잔 쏘기) 테이블
export const donations = mysqlTable("donations", {
  id: int("id").autoincrement().primaryKey(),
  /** 후원자 이름 (비로그인도 입력 가능) */
  donorName: varchar("donorName", { length: 100 }).notNull(),
  /** 후원 금액 (원) */
  amount: int("amount").notNull().default(0),
  /** 후원 메시지 */
  message: text("message"),
  /** 로그인 사용자 ID (비로그인: null) */
  userId: int("userId"),
  /** 관리자 확인 여부 */
  confirmed: boolean("confirmed").default(false).notNull(),
  /** 관리자 메모 */
  adminMemo: text("adminMemo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Donation = typeof donations.$inferSelect;
export type InsertDonation = typeof donations.$inferInsert;

// 광고 문의 테이블
export const adInquiries = mysqlTable("ad_inquiries", {
  id: int("id").autoincrement().primaryKey(),
  /** 문의자 이름 */
  name: varchar("name", { length: 100 }).notNull(),
  /** 문의자 이메일 */
  email: varchar("email", { length: 320 }).notNull(),
  /** 회사/브랜드명 */
  company: varchar("company", { length: 200 }),
  /** 광고 유형: banner(배너), sponsored(스폰서드 포스트), newsletter(뉴스레터), other(기타) */
  adType: mysqlEnum("adType", ["banner", "sponsored", "newsletter", "other"]).notNull().default("banner"),
  /** 광고 희망 기간 */
  period: varchar("period", { length: 100 }),
  /** 예산 범위 */
  budget: varchar("budget", { length: 100 }),
  /** 문의 내용 */
  message: text("message").notNull(),
  /** 로그인 사용자 ID (비로그인: null) */
  userId: int("userId"),
  /** 관리자 확인 여부 */
  confirmed: boolean("confirmed").default(false).notNull(),
  /** 관리자 메모 */
  adminMemo: text("adminMemo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdInquiry = typeof adInquiries.$inferSelect;
export type InsertAdInquiry = typeof adInquiries.$inferInsert;

// 쿠팡 파트너스 상품 캐시 테이블 (키워드별 검색 결과 6시간 캐싱)
export const coupangProductCache = mysqlTable("coupang_product_cache", {
  id: int("id").autoincrement().primaryKey(),
  /** 검색 키워드 */
  keyword: varchar("keyword", { length: 200 }).notNull(),
  /** 검색 결과 JSON (CoupangProduct[]) */
  products: text("products").notNull(),
  /** 캐시 저장 시각 (Unix ms) */
  cachedAt: bigint("cachedAt", { mode: "number" }).notNull(),
});
export type CoupangProductCache = typeof coupangProductCache.$inferSelect;

// 쿠팡 파트너스 버튼 클릭 트래킹 테이블
export const coupangClickLogs = mysqlTable("coupang_click_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 클릭된 버튼 문구 */
  btnText: varchar("btnText", { length: 200 }).notNull(),
  /** 클릭된 상품 ID */
  productId: varchar("productId", { length: 100 }),
  /** 클릭된 게시글 ID */
  postId: int("postId"),
  /** 클릭 시각 (Unix ms) */
  clickedAt: bigint("clickedAt", { mode: "number" }).notNull(),
});
export type CoupangClickLog = typeof coupangClickLogs.$inferSelect;
export type InsertCoupangClickLog = typeof coupangClickLogs.$inferInsert;

// 애드센스 광고 위치별 클릭 로그 테이블
export const adClickLogs = mysqlTable("ad_click_logs", {
  id: int("id").autoincrement().primaryKey(),
  /** 광고 위치 키 (after_title, after_intro, after_toc, between_h2, post_bottom_adsense, after_section_header, between_cards 등) */
  position: varchar("position", { length: 100 }).notNull(),
  /** 슬롯 번호 (1, 2, 3) */
  slotNum: int("slotNum").default(1).notNull(),
  /** 클릭이 발생한 게시글 ID (홈 섹션 광고는 null) */
  postId: int("postId"),
  /** 클릭 시각 (Unix ms) */
  clickedAt: bigint("clickedAt", { mode: "number" }).notNull(),
});
export type AdClickLog = typeof adClickLogs.$inferSelect;
export type InsertAdClickLog = typeof adClickLogs.$inferInsert;

// 카테고리별 광고 슬롯 설정 테이블
export const categoryAdSlots = mysqlTable("category_ad_slots", {
  id: int("id").autoincrement().primaryKey(),
  /** 카테고리 키 (nav_categories.categoryKey) */
  categoryKey: varchar("categoryKey", { length: 100 }).notNull().unique(),
  /** 슬롯1 코드 (상단 반응형) — 비어있으면 전역 slot1 사용 */
  slot1Code: text("slot1Code"),
  /** 슬롯2 코드 (중간 인피드) — 비어있으면 전역 slot2 사용 */
  slot2Code: text("slot2Code"),
  /** 슬롯3 코드 (하단 멀티플렉스) — 비어있으면 전역 slot3 사용 */
  slot3Code: text("slot3Code"),
  /** 이 카테고리에서 광고 비활성화 여부 */
  disabled: tinyint("disabled").default(0).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type CategoryAdSlot = typeof categoryAdSlots.$inferSelect;
export type InsertCategoryAdSlot = typeof categoryAdSlots.$inferInsert;

// 에디터 스타일 저장 테이블 (사용자가 저장한 텍스트 스타일 프리셋)
export const editorStyles = mysqlTable("editor_styles", {
  id: int("id").autoincrement().primaryKey(),
  /** 스타일 이름 (사용자 지정) */
  name: varchar("name", { length: 100 }).notNull(),
  /** 스타일 데이터 JSON (fontFamily, fontSize, lineHeight, color, bold, italic, underline 등) */
  styleData: text("styleData").notNull(),
  /** 생성자 (관리자 전용) */
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type EditorStyle = typeof editorStyles.$inferSelect;
export type InsertEditorStyle = typeof editorStyles.$inferInsert;

// 슬러그 변경 이력 테이블 (301 리디렉션용)
// customSlug 또는 slug가 변경될 때 이전 슬러그를 기록하여 구 URL → 신 URL 301 리디렉션에 활용
export const slugHistory = mysqlTable("slug_history", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  oldSlug: varchar("oldSlug", { length: 300 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SlugHistory = typeof slugHistory.$inferSelect;
export type InsertSlugHistory = typeof slugHistory.$inferInsert;

// 파일 메타데이터 테이블 (S3 key → 원본 파일명 매핑)
// storageProxy가 URL 파라미터 대신 DB에서 파일명을 조회하여 Content-Disposition 헤더 설정에 사용
export const fileMetadata = mysqlTable("file_metadata", {
  id: int("id").autoincrement().primaryKey(),
  /** S3 파일 키 (예: uploads/files/1780485208305_jlglcjlicmq_-_761a2ff7.zip) */
  fileKey: varchar("fileKey", { length: 500 }).notNull().unique(),
  /** 업로드 시 원본 파일명 (예: 구글 블로그글-생성기.zip) */
  originalFilename: varchar("originalFilename", { length: 500 }).notNull(),
  /** 파일 크기 (bytes) */
  fileSize: int("fileSize").default(0).notNull(),
  /** MIME 타입 */
  mimeType: varchar("mimeType", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type FileMetadata = typeof fileMetadata.$inferSelect;
export type InsertFileMetadata = typeof fileMetadata.$inferInsert;

// HTML 앱 일회성 토큰 테이블 (다중 인스턴스 환경에서 토큰 공유를 위해 DB 저장)
// 토큰 TTL: 5분 (300초), 사용 후 즉시 삭제
export const htmlTokens = mysqlTable("html_tokens", {
  token: varchar("token", { length: 64 }).primaryKey(),
  pageId: int("pageId").notNull(),
  sectionId: varchar("sectionId", { length: 100 }).notNull(),
  isAdmin: tinyint("isAdmin").default(0).notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});
export type HtmlToken = typeof htmlTokens.$inferSelect;
export type InsertHtmlToken = typeof htmlTokens.$inferInsert;

// 프록시 API 키 저장 테이블 (관리자가 설정한 API 키를 서버에 저장)
// 다중 키 지원: 같은 keyType(gemini/google)의 키를 여러 개 등록 가능
export const proxyApiKeys = mysqlTable("proxy_api_keys", {
  id: int("id").autoincrement().primaryKey(),
  /** 키 타입: 'gemini' | 'google' (unique 제약 제거 → 다중 등록 허용) */
  keyType: varchar("keyType", { length: 50 }).notNull(),
  /** 관리자가 붙이는 레이블 (예: "프로젝트A용 Gemini") */
  label: varchar("label", { length: 200 }).notNull().default(""),
  /** API 키 값 */
  keyValue: text("keyValue").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
});
export type ProxyApiKey = typeof proxyApiKeys.$inferSelect;
export type InsertProxyApiKey = typeof proxyApiKeys.$inferInsert;

// 프록시 API 키 ↔ 커스텀 페이지 연결 테이블
export const proxyKeyPageLinks = mysqlTable("proxy_key_page_links", {
  id: int("id").autoincrement().primaryKey(),
  /** 연결할 API 키 ID (proxyApiKeys.id) */
  keyId: int("keyId").notNull(),
  /** 연결할 커스텀 페이지 ID (custom_pages.id) */
  pageId: int("pageId").notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});
export type ProxyKeyPageLink = typeof proxyKeyPageLinks.$inferSelect;
export type InsertProxyKeyPageLink = typeof proxyKeyPageLinks.$inferInsert;

// 카테고리별 글쓰기 권한 테이블 (특정 사용자에게 특정 카테고리 글쓰기 허용)
export const categoryWritePermissions = mysqlTable("category_write_permissions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),        // users.id
  categoryKey: varchar("categoryKey", { length: 50 }).notNull(), // navItems의 카테고리 키
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CategoryWritePermission = typeof categoryWritePermissions.$inferSelect;
export type InsertCategoryWritePermission = typeof categoryWritePermissions.$inferInsert;
