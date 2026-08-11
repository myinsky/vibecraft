import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const LIMIT = 10;

export default function SearchPage() {
  const [location, setLocation] = useLocation();

  // URL에서 쿼리 파라미터 추출
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const initialQuery = params.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [inputValue, setInputValue] = useState(initialQuery);
  const [page, setPage] = useState(1);

  // URL 변경 감지 → 쿼리 업데이트
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const q = p.get("q") || "";
    setQuery(q);
    setInputValue(q);
    setPage(1);
  }, [location]);

  const { data, isLoading } = trpc.posts.search.useQuery(
    { query, page, limit: LIMIT },
    { enabled: query.trim().length > 0 }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setLocation(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px 64px" }}>
        {/* 검색 폼 */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 32 }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center",
            border: "1.5px solid #e5e7eb", borderRadius: 10,
            background: "#fff", padding: "0 12px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="검색어를 입력하세요..."
              style={{
                flex: 1, border: "none", outline: "none",
                padding: "12px 10px", fontSize: 15, background: "none",
                color: "#111827",
              }}
              autoFocus
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => setInputValue("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "0 4px" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            style={{
              background: "#6366f1", color: "#fff", border: "none",
              borderRadius: 10, padding: "0 24px", fontSize: 14, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            검색
          </button>
        </form>

        {/* 검색 결과 헤더 */}
        {query && (
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
              <span style={{ color: "#6366f1" }}>"{query}"</span> 검색 결과
              {data && (
                <span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>
                  총 {data.total.toLocaleString()}건
                </span>
              )}
            </h2>
          </div>
        )}

        {/* 로딩 */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <p style={{ marginTop: 12, fontSize: 14 }}>검색 중...</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* 검색어 없음 */}
        {!query && !isLoading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginBottom: 16 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <p style={{ fontSize: 16, fontWeight: 500, color: "#6b7280" }}>검색어를 입력해주세요</p>
          </div>
        )}

        {/* 결과 없음 */}
        {query && !isLoading && data && data.posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginBottom: 16 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <p style={{ fontSize: 16, fontWeight: 500, color: "#6b7280" }}>
              <span style={{ color: "#6366f1" }}>"{query}"</span>에 대한 검색 결과가 없습니다.
            </p>
            <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>다른 검색어를 입력해보세요.</p>
          </div>
        )}

        {/* 검색 결과 목록 */}
        {data && data.posts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.posts.map(post => {
              const slug = post.customSlug || post.slug;
              const postUrl = slug ? `/post/${slug}` : `/post/id/${post.id}`;
              const highlight = (text: string) => {
                if (!query) return text;
                const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
                return text.replace(regex, `<mark style="background:#fef08a;color:#111827;padding:0 2px;border-radius:2px">$1</mark>`);
              };
              return (
                <a
                  key={post.id}
                  href={postUrl}
                  style={{ textDecoration: "none" }}
                >
                  <div style={{
                    background: "#fff", borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    padding: "20px 24px",
                    display: "flex", gap: 16, alignItems: "flex-start",
                    transition: "box-shadow 0.15s, border-color 0.15s",
                    cursor: "pointer",
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(99,102,241,0.12)";
                      (e.currentTarget as HTMLElement).style.borderColor = "#a5b4fc";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                      (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb";
                    }}
                  >
                    {post.thumbnail && (
                      <img
                        src={post.thumbnail}
                        alt={post.title}
                        style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        {post.category && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, color: "#6366f1",
                            background: "#ede9fe", borderRadius: 4, padding: "2px 8px",
                          }}>
                            {post.category}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                          {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <h3
                        style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 6px", lineHeight: 1.4 }}
                        dangerouslySetInnerHTML={{ __html: highlight(post.title) }}
                      />
                      {post.excerpt && (
                        <p
                          style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}
                          dangerouslySetInnerHTML={{ __html: highlight(post.excerpt) }}
                        />
                      )}
                      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>👁 {(post.views || 0).toLocaleString()}</span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>❤️ {(post.likes || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                background: page === 1 ? "#f9fafb" : "#fff", cursor: page === 1 ? "not-allowed" : "pointer",
                color: page === 1 ? "#9ca3af" : "#374151", fontSize: 13, fontWeight: 500,
              }}
            >
              이전
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: "8px 14px", borderRadius: 8,
                    border: page === p ? "1.5px solid #6366f1" : "1px solid #e5e7eb",
                    background: page === p ? "#6366f1" : "#fff",
                    color: page === p ? "#fff" : "#374151",
                    cursor: "pointer", fontSize: 13, fontWeight: 500,
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                background: page === totalPages ? "#f9fafb" : "#fff",
                cursor: page === totalPages ? "not-allowed" : "pointer",
                color: page === totalPages ? "#9ca3af" : "#374151", fontSize: 13, fontWeight: 500,
              }}
            >
              다음
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
