import { useLocation } from "wouter";
import { getPostUrl } from "@/lib/postUrl";
import { Tag, Eye, Heart, ArrowLeft, Loader2 } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import Sidebar from "../components/Sidebar";
import { trpc } from "@/lib/trpc";
import { useSEO } from "@/hooks/useSEO";
import LazyImage from "@/components/LazyImage";

interface Props {
  tag: string;
}

interface DBPost {
  id: number;
  title: string;
  content?: string;
  excerpt: string | null;
  thumbnail: string | null;
  category: string;
  tag: string | null;
  badge: string | null;
  views: number;
  likes: number;
  slug?: string | null;
  authorId?: number;
  published?: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

function PostListItem({ post }: { post: DBPost }) {
  const [, navigate] = useLocation();
  const dateStr = new Date(post.createdAt).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <article
      style={{
        display: "flex", gap: 18,
        padding: "20px 0",
        borderBottom: "1px solid #e5e7eb",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onClick={() => navigate(getPostUrl(post))}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.03)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ""}
    >
      {/* Thumbnail */}
      {post.thumbnail && (
        <div style={{
          width: 120, height: 80, borderRadius: 8, overflow: "hidden",
          flexShrink: 0, background: "#f3f4f6",
        }}>
          <LazyImage
            src={post.thumbnail}
            alt={post.title}
            sizes="(max-width: 640px) 100vw, 120px"
            width={120}
            height={80}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      )}
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: "#111827",
          margin: "0 0 6px", lineHeight: 1.4,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
        }}>{post.title}</h3>
        {post.excerpt && (
          <p style={{
            fontSize: 13, color: "#6b7280", lineHeight: 1.6,
            margin: "0 0 8px",
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
          }}>{post.excerpt}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#9ca3af" }}>
          <span>{dateStr}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Eye size={11} /> {post.views.toLocaleString()}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Heart size={11} /> {post.likes.toLocaleString()}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function TagPage({ tag }: Props) {
  const decodedTag = decodeURIComponent(tag);
  useSEO({ title: `#${decodedTag} 태그 글 목록 | 스마트 오토 가이드` });
  const [, navigate] = useLocation();

  const { data: posts, isLoading } = trpc.posts.getByTag.useQuery({ tag: decodedTag });
  const { data: allTags } = trpc.posts.getAllTags.useQuery();

  // 글이 0개인 태그 페이지는 생성하지 않음 — 404로 리다이렉트
  if (!isLoading && (!posts || posts.length === 0)) {
    navigate("/not-found", { replace: true } as any);
    return null;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />
      <div style={{
        maxWidth: 1400, margin: "0 auto",
        padding: "24px 10px",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}>
        {/* Left Sidebar */}
        <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
          <Sidebar side="left" />
        </div>

        {/* Main Content */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* 헤더 */}
          <div style={{
            background: "#ffffff", border: "1px solid #e5e7eb",
            borderRadius: 12, padding: "24px 28px", marginBottom: 20,
          }}>
            <button
              onClick={() => navigate(-1 as any)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: "#6b7280", padding: 0, marginBottom: 16,
              }}
            >
              <ArrowLeft size={14} /> 뒤로가기
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Tag size={20} color="#fff" />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: 0 }}>
                  #{decodedTag}
                </h1>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
                  {isLoading ? "로딩 중..." : `${posts?.length ?? 0}개의 글`}
                </p>
              </div>
            </div>
          </div>

          {/* 게시물 목록 */}
          <div style={{
            background: "#ffffff", border: "1px solid #e5e7eb",
            borderRadius: 12, padding: "0 24px",
          }}>
            {isLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10, color: "#6b7280" }}>
                <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
                <span>게시물을 불러오는 중...</span>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : !posts || posts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏷️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  #{decodedTag} 태그의 글이 없습니다
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  아직 이 태그로 작성된 글이 없어요.
                </div>
              </div>
            ) : (
              <div>
                {posts.map((post: DBPost) => (
                  <PostListItem key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar - 관련 태그 */}
        <div className="sidebar-col" style={{ width: 160, flexShrink: 0 }}>
          <Sidebar side="right" />
          {/* 인기 태그 */}
          {allTags && allTags.length > 0 && (
            <div style={{
              background: "#ffffff", border: "1px solid #e5e7eb",
              borderRadius: 10, padding: "14px 12px", marginTop: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                인기 태그
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(allTags as { tag: string; count: number }[]).slice(0, 20).map(({ tag: t, count }) => (
                  <a
                    key={t}
                    href={`/tag/${encodeURIComponent(t)}`}
                    style={{
                      display: "inline-flex", alignItems: "center",
                      background: t === decodedTag ? "#6366f1" : "#f0f0ff",
                      border: `1px solid ${t === decodedTag ? "#6366f1" : "#c7d2fe"}`,
                      borderRadius: 20, padding: "3px 8px",
                      fontSize: 11, color: t === decodedTag ? "#fff" : "#4338ca",
                      fontWeight: 600, textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                  >#{t} <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{count}</span></a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
      <style>{`
        @media (max-width: 1100px) {
          .sidebar-col { display: none !important; }
        }
      `}</style>
    </div>
  );
}
