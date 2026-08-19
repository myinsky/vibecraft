import { parse as parseCookieHeader } from "cookie";
import { sql } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getDb, getUserByOpenId } from "./db";
import { sdk } from "./_core/sdk";

const PAGE_SIZE = 500;
const SENSITIVE_CONFIG_KEY_PATTERN = "key|secret|token|password|credential|oauth|apikey|private";
const EXCLUDED_TABLES = ["html_tokens", "backup_jobs"] as const;

type ExportTable = { name: string; primaryKey: string; columns: readonly string[] };

// Temporary migration allowlist. No table or column identifier comes from the request.
export const FULL_EXPORT_TABLES = [
  { name: "ad_click_logs", primaryKey: "id", columns: ["id", "position", "slotNum", "postId", "clickedAt"] },
  { name: "ad_inquiries", primaryKey: "id", columns: ["id", "name", "email", "company", "adType", "period", "budget", "message", "userId", "confirmed", "adminMemo", "createdAt"] },
  { name: "api_keys", primaryKey: "id", columns: ["id", "userId", "name", "keyHash", "keyPrefix", "lastUsedAt", "expiresAt", "active", "createdAt"] },
  { name: "app_reviews", primaryKey: "id", columns: ["id", "appId", "userId", "rating", "content", "createdAt"] },
  { name: "backup_history", primaryKey: "id", columns: ["id", "fileKey", "fileUrl", "fileSize", "countsJson", "isAuto", "scheduleCronTaskUid", "createdAt"] },
  { name: "category_ad_slots", primaryKey: "id", columns: ["id", "categoryKey", "slot1Code", "slot2Code", "slot3Code", "disabled", "updatedAt"] },
  { name: "category_comment_settings", primaryKey: "id", columns: ["id", "categoryKey", "commentsEnabled", "updatedAt"] },
  { name: "category_write_permissions", primaryKey: "id", columns: ["id", "userId", "categoryKey", "createdAt"] },
  { name: "chat_sessions", primaryKey: "id", columns: ["id", "userId", "title", "messages", "createdAt", "updatedAt"] },
  { name: "comment_likes", primaryKey: "id", columns: ["id", "commentId", "userId", "targetType", "createdAt"] },
  { name: "comments", primaryKey: "id", columns: ["id", "postId", "pageId", "userId", "userName", "content", "isHidden", "aiReply", "aiRepliedAt", "createdAt", "likeCount", "aiReplyLikeCount"] },
  { name: "coupang_click_logs", primaryKey: "id", columns: ["id", "btnText", "productId", "postId", "clickedAt"] },
  { name: "coupang_product_cache", primaryKey: "id", columns: ["id", "keyword", "products", "cachedAt"] },
  { name: "custom_pages", primaryKey: "id", columns: ["id", "slug", "title", "description", "sectionsJson", "published", "showInNav", "sortOrder", "createdAt", "updatedAt", "hideSidebar", "postListCategory", "viewCount", "commentsEnabled", "membersOnly", "mainSectionKey", "thumbnail", "archived_status", "archive_memo", "contentWidth", "fullscreenDefault", "showTitle", "showDescription", "hideChrome", "titleAlign"] },
  { name: "donations", primaryKey: "id", columns: ["id", "donorName", "amount", "message", "userId", "confirmed", "adminMemo", "createdAt"] },
  { name: "editor_styles", primaryKey: "id", columns: ["id", "name", "styleData", "createdAt", "updatedAt"] },
  { name: "file_metadata", primaryKey: "id", columns: ["id", "fileKey", "originalFilename", "fileSize", "mimeType", "createdAt"] },
  { name: "home_sections", primaryKey: "id", columns: ["id", "sectionKey", "title", "subtitle", "categoryPath", "sortOrder", "visible", "updatedAt"] },
  { name: "legal_pages", primaryKey: "id", columns: ["id", "slug", "title", "content", "updatedAt"] },
  { name: "nav_items", primaryKey: "id", columns: ["id", "label", "path", "sortOrder", "visible", "updatedAt", "sectionStyle", "description", "bgColor", "textColor", "displayRows", "showOnHome", "thumbSize", "statBannerData", "introHtml", "sectionMarginBottom", "sectionSortMode"] },
  { name: "page_upgrade_history", primaryKey: "id", columns: ["id", "pageId", "pageTitle", "sectionsJson", "createdAt", "note", "memo"] },
  { name: "post_likes", primaryKey: "id", columns: ["id", "postId", "userId", "createdAt"] },
  { name: "post_scroll_stats", primaryKey: "id", columns: ["id", "postId", "depth10", "depth20", "depth30", "depth40", "depth50", "depth60", "depth70", "depth80", "depth90", "depth100", "totalVisits", "updatedAt"] },
  { name: "post_tags", primaryKey: "id", columns: ["id", "postId", "tag", "createdAt"] },
  { name: "post_view_logs", primaryKey: "id", columns: ["id", "postId", "visitorType", "referrer", "referrerDomain", "referrerType", "userAgent", "createdAt"] },
  { name: "posts", primaryKey: "id", columns: ["id", "title", "excerpt", "content", "thumbnail", "category", "tag", "badge", "authorId", "views", "likes", "published", "createdAt", "updatedAt", "status", "scheduledAt", "isPinned", "pinnedAt", "slug", "deletedAt", "isHtmlSource", "isAppMode", "appEmbedUrl", "embedWidth", "showInSection", "allowComments", "coupangKeywords", "disableAds", "enableToc", "customSlug"] },
  { name: "proxy_api_keys", primaryKey: "id", columns: ["id", "keyType", "label", "createdAt", "updatedAt"] },
  { name: "proxy_key_page_links", primaryKey: "id", columns: ["id", "keyId", "pageId", "createdAt"] },
  { name: "publish_logs", primaryKey: "id", columns: ["id", "userId", "postId", "title", "category", "status", "scheduledAt", "keyName", "createdAt"] },
  { name: "sidebar_items", primaryKey: "id", columns: ["id", "side", "itemType", "title", "description", "url", "bgColor", "textColor", "btnText", "btnColor", "badge", "price", "sortOrder", "visible", "createdAt", "updatedAt", "htmlCode", "menuStyle", "menuFontWeight", "menuBgColor", "menuBorderRadius", "menuFontSize", "menuHeaderHidden"] },
  { name: "site_config", primaryKey: "id", columns: ["id", "configKey", "configValue", "updatedAt"] },
  { name: "slug_history", primaryKey: "id", columns: ["id", "postId", "oldSlug", "createdAt"] },
  { name: "users", primaryKey: "id", columns: ["id", "openId", "name", "email", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn", "agreedToTerms", "agreedAt", "canWrite", "canDownload", "memo", "isBanned", "isOwner", "username", "isFeaturedDeveloper", "featuredOrder", "bio", "profileImage", "isDeveloper", "developerRegisteredAt", "isWithdrawn", "withdrawnAt", "withdrawnReason", "rejoinPolicy", "rejoinBlockUntil"] },
  { name: "vibe_apps", primaryKey: "id", columns: ["id", "name", "description", "longDescription", "category", "techStack", "features", "howToUse", "downloadUrl", "thumbnail", "gradient", "downloads", "ratingSum", "ratingCount", "authorId", "published", "createdAt", "updatedAt", "originalFilename", "appUrl", "submissionStatus", "submittedBy", "rejectionReason", "pcDownloadUrl", "pcOriginalFilename", "mobileDownloadUrl", "mobileOriginalFilename", "likeCount", "viewCount"] },
  { name: "visit_logs", primaryKey: "id", columns: ["id", "sessionId", "path", "postId", "userId", "userRole", "deviceType", "browser", "os", "referrer", "referrerType", "duration", "scrollDepth", "createdAt", "searchKeyword"] },
] as const satisfies readonly ExportTable[];

const ALL_SOURCE_TABLES = [...FULL_EXPORT_TABLES.map(table => table.name), ...EXCLUDED_TABLES] as const;
type ExportRow = Record<string, unknown>;
type JsonSafe = null | boolean | number | string | JsonSafe[] | { [key: string]: JsonSafe };
type ManualReentry = { table: string; field: string; reason: "secret"; configKey?: string };

function validateStaticAllowlist(): void {
  const names = new Set(ALL_SOURCE_TABLES);
  if (FULL_EXPORT_TABLES.length !== 35 || ALL_SOURCE_TABLES.length !== 37 || names.size !== 37) {
    throw new Error("Invalid full export allowlist");
  }
  for (const table of FULL_EXPORT_TABLES) {
    if (!table.columns.includes(table.primaryKey)) throw new Error("Invalid export primary key");
  }
}
validateStaticAllowlist();

function toJsonSafe(value: unknown): JsonSafe {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { type: "Buffer", encoding: "base64", data: value.toString("base64") };
  if (value instanceof Uint8Array) return { type: "Uint8Array", encoding: "base64", data: Buffer.from(value).toString("base64") };
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]));
  }
  return String(value);
}

function getRows(result: unknown): ExportRow[] {
  if (!Array.isArray(result) || !Array.isArray(result[0])) throw new Error("Unexpected database result");
  return result[0] as ExportRow[];
}

function makeExportFilename(now: Date): string {
  const compact = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `vibecraft-full-export-${compact}.json`;
}

async function writeChunk(res: Response, chunk: string): Promise<boolean> {
  if (res.destroyed) return false;
  if (res.write(chunk)) return true;
  await new Promise<void>(resolve => {
    const finish = () => {
      res.off("drain", finish);
      res.off("close", finish);
      resolve();
    };
    res.once("drain", finish);
    res.once("close", finish);
  });
  return !res.destroyed;
}

function selectedColumns(table: ExportTable) {
  if (table.name === "site_config") {
    return sql`id, configKey, CASE WHEN LOWER(configKey) REGEXP ${SENSITIVE_CONFIG_KEY_PATTERN} THEN NULL ELSE configValue END AS configValue, updatedAt`;
  }
  return sql.raw(table.columns.map(column => `\`${column}\``).join(", "));
}

async function authenticateAdminReadOnly(req: Request): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const session = await sdk.verifySession(cookies[COOKIE_NAME]);
  if (!session || session.openId.startsWith("cron_")) return false;
  // sdk.authenticateRequest() updates lastSignedIn; this path intentionally only SELECTs.
  const user = await getUserByOpenId(session.openId);
  return user?.role === "admin";
}

export function registerFullDataExportRoute(app: Express): void {
  app.get("/api/admin/export-all-data", async (req: Request, res: Response) => {
    try {
      if (!(await authenticateAdminReadOnly(req))) return res.status(404).json({ error: "Not found" });
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });

      const sensitiveConfigResult = await db.execute(
        sql`SELECT configKey FROM ${sql.identifier("site_config")} WHERE LOWER(configKey) REGEXP ${SENSITIVE_CONFIG_KEY_PATTERN} ORDER BY id`,
      );
      const sensitiveConfigKeys = new Set(getRows(sensitiveConfigResult).map(row => String(row.configKey)));
      const requiresManualReentry: ManualReentry[] = [
        { table: "proxy_api_keys", field: "keyValue", reason: "secret" },
        ...Array.from(sensitiveConfigKeys, configKey => ({
          table: "site_config", field: "configValue", reason: "secret" as const, configKey,
        })),
      ];

      const counts: Record<string, { sourceRowCount: number | string; exportedRowCount: number | string }> = {};
      for (const tableName of ALL_SOURCE_TABLES) {
        const countResult = await db.execute(sql`SELECT COUNT(*) AS count FROM ${sql.identifier(tableName)}`);
        const rawCount = getRows(countResult)[0]?.count ?? 0;
        const numericCount = Number(rawCount);
        const sourceRowCount = Number.isSafeInteger(numericCount) ? numericCount : String(rawCount);
        counts[tableName] = {
          sourceRowCount,
          exportedRowCount: (EXCLUDED_TABLES as readonly string[]).includes(tableName) ? 0 : sourceRowCount,
        };
      }

      const exportedAt = new Date();
      res.status(200);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${makeExportFilename(exportedAt)}"`);
      res.setHeader("Cache-Control", "no-store");
      await writeChunk(res, `{"version":1,"exportedAt":${JSON.stringify(exportedAt.toISOString())},"counts":`);
      await writeChunk(res, JSON.stringify(counts));
      await writeChunk(res, `,"excludedTables":${JSON.stringify(EXCLUDED_TABLES)}`);
      await writeChunk(res, `,"requiresManualReentry":${JSON.stringify(requiresManualReentry)},"tables":{`);

      for (let tableIndex = 0; tableIndex < FULL_EXPORT_TABLES.length; tableIndex++) {
        const table = FULL_EXPORT_TABLES[tableIndex];
        if (tableIndex > 0) await writeChunk(res, ",");
        await writeChunk(res, `${JSON.stringify(table.name)}:[`);
        let lastPrimaryKey: unknown;
        let firstRow = true;
        while (!res.destroyed) {
          const query = lastPrimaryKey === undefined
            ? sql`SELECT ${selectedColumns(table)} FROM ${sql.identifier(table.name)} ORDER BY ${sql.identifier(table.primaryKey)} LIMIT ${PAGE_SIZE}`
            : sql`SELECT ${selectedColumns(table)} FROM ${sql.identifier(table.name)} WHERE ${sql.identifier(table.primaryKey)} > ${lastPrimaryKey} ORDER BY ${sql.identifier(table.primaryKey)} LIMIT ${PAGE_SIZE}`;
          const rows = getRows(await db.execute(query));
          if (rows.length === 0) break;
          for (const originalRow of rows) {
            const row = { ...originalRow };
            if (table.name === "site_config" && sensitiveConfigKeys.has(String(row.configKey))) delete row.configValue;
            if (!firstRow) await writeChunk(res, ",");
            await writeChunk(res, JSON.stringify(toJsonSafe(row)));
            firstRow = false;
          }
          lastPrimaryKey = rows[rows.length - 1][table.primaryKey];
          if (lastPrimaryKey === undefined || rows.length < PAGE_SIZE) break;
        }
        await writeChunk(res, "]");
      }
      if (!res.destroyed) res.end("}}");
    } catch (error) {
      console.error("[Full export] failed", error instanceof Error ? error.name : "UnknownError");
      if (!res.headersSent) res.status(500).json({ error: "Export failed" });
      else res.destroy();
    }
  });
}
