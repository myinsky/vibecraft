import type { Post } from "../data/blogData";
import { makeSrcSet, CARD_SIZES, FEATURED_SIZES } from "@/lib/imageUtils";

interface BlogCardProps {
  post: Post;
  variant?: "small" | "medium" | "featured";
}

export default function BlogCard({ post, variant = "small" }: BlogCardProps) {
  if (variant === "featured") {
    return (
      <a href="#" style={{
        display: "block",
        background: "#ffffff",
        border: "1px solid #1e2040",
        borderRadius: 10,
        overflow: "hidden",
        textDecoration: "none",
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
        }}>
        <div style={{ position: "relative", overflow: "hidden", height: 200 }}>
          <img
            loading="lazy"
            src={post.image}
            srcSet={makeSrcSet(post.image)}
            sizes={FEATURED_SIZES}
            alt={post.title}
            width={600}
            height={200}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,13,26,0.8) 0%, transparent 50%)" }} />

        </div>
        <div style={{ padding: "12px 14px 12px" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", lineHeight: 1.4, marginBottom: 6 }}>{post.title}</div>
          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>{post.excerpt}</div>
        </div>
      </a>
    );
  }

  return (
    <a href="#" style={{
      display: "block",
      background: "#ffffff",
      border: "1px solid #1e2040",
      borderRadius: 10,
      overflow: "hidden",
      textDecoration: "none",
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
      }}>
      <div style={{ position: "relative", overflow: "hidden", height: 130 }}>
        <img
          loading="lazy"
          src={post.image}
          srcSet={makeSrcSet(post.image)}
          sizes={CARD_SIZES}
          alt={post.title}
          width={300}
          height={130}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(13,13,26,0.6) 0%, transparent 60%)" }} />

      </div>
      <div style={{ padding: "9px 11px 9px" }}>
        <div style={{
          fontSize: 12, fontWeight: 700, color: "#111827",
          lineHeight: 1.4, margin: 0,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}>{post.title}</div>
      </div>
    </a>
  );
}
