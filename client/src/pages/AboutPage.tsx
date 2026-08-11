/**
 * AboutPage (/about)
 * 사이트 소개 페이지 — 구글 애드센스 EEAT(전문성/신뢰성/권위성) 기준 충족
 * - 사이트 목적 및 운영 방향
 * - 운영자 소개
 * - 주요 콘텐츠 카테고리
 * - 연락처 안내
 */
import { trpc } from "@/lib/trpc";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "wouter";

export default function AboutPage() {
  const { data: config } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  const { data: navItemsData } = trpc.admin.getNavItems.useQuery();

  const siteTitle = config?.siteTitle ?? "Smart Auto Guide";
  const siteDescription = config?.siteDescription ?? "";
  const navItems = (navItemsData ?? []).filter((item) => item.visible !== false);

  useSEO({
    title: `소개 | ${siteTitle}`,
    description: `${siteTitle}은 AI 앱 만들기(바이브 코딩), 자동화, AI 툴 추천 등 실용적인 기술 정보를 제공하는 블로그입니다.`,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "48px 20px 80px" }}>
        {/* 페이지 제목 */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{
            fontSize: 36, fontWeight: 900, color: "#111827",
            marginBottom: 12, lineHeight: 1.3,
          }}>
            {siteTitle} 소개
          </h1>
          {siteDescription && (
            <p style={{ fontSize: 16, color: "#6b7280", lineHeight: 1.8, maxWidth: 560, margin: "0 auto" }}>
              {siteDescription}
            </p>
          )}
        </div>

        {/* 사이트 소개 카드 */}
        <section style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "40px 48px",
          marginBottom: 28,
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 16 }}>
            이 블로그는 무엇을 다루나요?
          </h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.9, marginBottom: 16 }}>
            <strong>{siteTitle}</strong>은 AI와 자동화 기술을 활용해 실제 앱을 만들고, 업무를 자동화하며, 더 스마트하게 일하는 방법을 공유하는 블로그입니다.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.9, marginBottom: 16 }}>
            코딩 경험이 없어도 AI 도구를 활용해 실용적인 앱과 자동화 시스템을 만들 수 있습니다.
            이른바 <strong>바이브 코딩(Vibe Coding)</strong> — AI와 함께 아이디어를 빠르게 현실로 만드는 방법을 직접 실험하고 정리합니다.
          </p>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.9 }}>
            모든 글은 직접 사용해보고, 실패도 경험하며 얻은 실전 노하우를 바탕으로 작성됩니다.
            광고성 정보나 과장된 내용 없이, 솔직하고 실용적인 정보만 전달하는 것을 원칙으로 합니다.
          </p>
        </section>

        {/* 주요 카테고리 */}
        {navItems.length > 0 && (
          <section style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: "40px 48px",
            marginBottom: 28,
          }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 20 }}>
              주요 콘텐츠
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {navItems.map((item) => (
                <Link
                  key={item.id ?? item.label}
                  href={item.path}
                  style={{
                    display: "block",
                    padding: "16px 20px",
                    background: "#f3f4f6",
                    borderRadius: 10,
                    textDecoration: "none",
                    color: "#374151",
                    fontSize: 14,
                    fontWeight: 600,
                    transition: "all 0.15s",
                    border: "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#ede9fe";
                    (e.currentTarget as HTMLElement).style.borderColor = "#a5b4fc";
                    (e.currentTarget as HTMLElement).style.color = "#6366f1";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                    (e.currentTarget as HTMLElement).style.borderColor = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#374151";
                  }}
                >
                  {item.label} →
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 운영 원칙 */}
        <section style={{
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "40px 48px",
          marginBottom: 28,
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", marginBottom: 20 }}>
            운영 원칙
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {[
              { icon: "✅", title: "직접 검증", desc: "모든 도구와 방법은 직접 사용해보고 결과를 확인한 후 작성합니다." },
              { icon: "🎯", title: "실용성 우선", desc: "이론보다 실제로 써먹을 수 있는 정보를 우선합니다." },
              { icon: "🔍", title: "솔직한 리뷰", desc: "장점뿐 아니라 단점과 주의사항도 솔직하게 공유합니다." },
              { icon: "🔄", title: "지속적 업데이트", desc: "AI 기술은 빠르게 변합니다. 정보가 달라지면 글을 업데이트합니다." },
            ].map((item) => (
              <li key={item.title} style={{
                display: "flex", gap: 16, alignItems: "flex-start",
                padding: "14px 0",
                borderBottom: "1px solid #f3f4f6",
              }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                <div>
                  <strong style={{ fontSize: 14, color: "#111827", display: "block", marginBottom: 4 }}>{item.title}</strong>
                  <span style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7 }}>{item.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 연락처 */}
        <section style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          borderRadius: 16,
          padding: "40px 48px",
          textAlign: "center",
          color: "#ffffff",
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
            문의 및 제안
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 24, opacity: 0.9 }}>
            콘텐츠 제안, 오류 제보, 광고 문의 등 모든 연락을 환영합니다.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/contact"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "#ffffff",
                color: "#6366f1",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
            >
              문의하기 →
            </Link>
            <Link
              href="/advertise"
              style={{
                display: "inline-block",
                padding: "12px 28px",
                background: "rgba(255,255,255,0.15)",
                color: "#ffffff",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.4)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)")}
            >
              광고 문의 →
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
