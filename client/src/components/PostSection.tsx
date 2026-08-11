import type { Post } from "../data/blogData";
import BlogCard from "./BlogCard";

interface PostSectionProps {
  title: string;
  posts: Post[];
  columns?: number;
}

export default function PostSection({ title, posts, columns = 4 }: PostSectionProps) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid #1e2040",
      }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
        <a href="#" style={{
          fontSize: 12, color: "#6366f1", textDecoration: "none",
          padding: "5px 12px", borderRadius: 5,
          border: "1px solid #2a2a45", background: "#ffffff",
        }}>더보기 →</a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
        {posts.slice(0, columns * 2).map(post => (
          <BlogCard key={post.id} post={post} variant="small" />
        ))}
      </div>
    </section>
  );
}
