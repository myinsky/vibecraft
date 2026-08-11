import { useState } from "react";
import type { Post } from "../data/blogData";
import { Download } from "lucide-react";
import AuthModal from "./AuthModal";

interface Props {
  sectionNum: string;
  title: string;
  subtitle: string;
  posts: Post[];
}

const fileTypeColors: Record<string, { bg: string; text: string }> = {
  ZIP:  { bg: "#f59e0b", text: "#fff" },
  PDF:  { bg: "#e11d48", text: "#fff" },
  CSV:  { bg: "#10b981", text: "#fff" },
  JSON: { bg: "#0ea5e9", text: "#fff" },
  TXT:  { bg: "#6366f1", text: "#fff" },
  MP4:  { bg: "#7c3aed", text: "#fff" },
  PNG:  { bg: "#ec4899", text: "#fff" },
  XLSX: { bg: "#10b981", text: "#fff" },
  MD:   { bg: "#64748b", text: "#fff" },
};

export default function DownloadSection({ sectionNum, title, subtitle, posts }: Props) {
  const [authOpen, setAuthOpen] = useState(false);

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setAuthOpen(true);
  };

  return (
    <section style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid #1e2040",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "#fff", fontSize: 12, fontWeight: 900,
            width: 26, height: 26, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 8px rgba(99,102,241,0.4)", flexShrink: 0,
          }}>{sectionNum}</span>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.2 }}>{title}</h2>
            <p style={{ fontSize: 11, color: "#6b7280", margin: 0, marginTop: 2 }}>{subtitle}</p>
          </div>
        </div>
        <a href="#" style={{
          fontSize: 12, color: "#6366f1", textDecoration: "none",
          padding: "5px 12px", borderRadius: 5,
          border: "1px solid #2a2a45", background: "#ffffff",
          whiteSpace: "nowrap",
        }}>자료실 전체 보기 →</a>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {posts.map(post => {
          const ft = post.fileType || "ZIP";
          const colors = fileTypeColors[ft] || { bg: "#6b7280", text: "#fff" };
          return (
            <a
              key={post.id}
              href="#"
              onClick={handleDownloadClick}
              style={{
                display: "flex", flexDirection: "column",
                background: "#ffffff", border: "1px solid #1e2040",
                borderRadius: 10, overflow: "hidden", textDecoration: "none",
                transition: "transform 0.18s, border-color 0.18s, box-shadow 0.18s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "translateY(-3px)";
                el.style.borderColor = "#4338ca";
                el.style.boxShadow = "0 8px 24px rgba(99,102,241,0.15)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "";
                el.style.borderColor = "#e5e7eb";
                el.style.boxShadow = "";
              }}
            >
              {/* File type header */}
              <div style={{
                background: colors.bg,
                padding: "14px 14px 10px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: colors.text, letterSpacing: "-0.5px" }}>{ft}</span>
                <Download size={16} color={colors.text} style={{ opacity: 0.8 }} />
              </div>

              {/* Content */}
              <div style={{ padding: "10px 12px 12px", flex: 1 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "#111827",
                  lineHeight: 1.4, marginBottom: 5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{post.title}</div>
                <div style={{
                  fontSize: 10, color: "#6b7280", lineHeight: 1.45, marginBottom: 8,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}>{post.excerpt}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, color: "#6b7280" }}>{post.fileSize}</span>
                  <span style={{ fontSize: 9, color: "#6b7280" }}>
                    {post.downloads ? `${(post.downloads / 1000).toFixed(1)}K 다운` : ""}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "#374151", marginTop: 3 }}>{post.date}</div>

                {/* Download button */}
                <div style={{
                  marginTop: 9,
                  background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
                  border: "1px solid rgba(99,102,241,0.25)",
                  borderRadius: 6, padding: "5px 0",
                  textAlign: "center",
                  fontSize: 10, fontWeight: 700, color: "#6366f1",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}>
                  <Download size={10} />
                  다운로드
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultTab="login"
      />
    </section>
  );
}
