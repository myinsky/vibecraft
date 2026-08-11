import React from "react";
import { trpc } from "@/lib/trpc";
import { Star, User } from "lucide-react";

interface FeaturedDevelopersSectionProps {
  title?: string;
  description?: string;
  color?: string | null;
}

export default function FeaturedDevelopersSection({
  title = "주목 개발자",
  description = "바이브 코딩으로 멋진 앱을 만들어가는 개발자들을 소개합니다",
  color,
}: FeaturedDevelopersSectionProps) {
  const { data: developers, isLoading } = trpc.developers.getFeatured.useQuery();

  if (isLoading) {
    return (
      <div style={{ padding: "32px 0" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              flex: "1 1 200px", minWidth: 180, maxWidth: 260,
              background: "#1a1f35", borderRadius: 12, padding: "20px 16px",
              animation: "pulse 1.5s infinite",
            }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#2a2f45", marginBottom: 12 }} />
              <div style={{ height: 14, background: "#2a2f45", borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 10, background: "#2a2f45", borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!developers || developers.length === 0) {
    return null;
  }

  const accentColor = color || "#6366f1";

  return (
    <div style={{ padding: "0 0 8px" }}>
      {/* 섹션 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 4, height: 20, borderRadius: 2,
          background: accentColor,
        }} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Star size={14} fill={accentColor} color={accentColor} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{title}</span>
          </div>
          {description && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{description}</div>
          )}
        </div>
      </div>

      {/* 개발자 카드 그리드 */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 12,
      }}>
        {developers.map((dev) => (
          <div key={dev.id} style={{
            background: "linear-gradient(135deg, #1a1f35 0%, #1e2540 100%)",
            border: "1px solid #2a3050",
            borderRadius: 12,
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            textAlign: "center" as const,
            transition: "transform 0.2s, box-shadow 0.2s",
            cursor: "default",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px rgba(99,102,241,0.15)`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
          >
            {/* 아바타 */}
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              background: dev.profileImage
                ? undefined
                : `linear-gradient(135deg, ${accentColor}, #8b5cf6)`,
              overflow: "hidden",
              marginBottom: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${accentColor}30`,
              flexShrink: 0,
            }}>
              {dev.profileImage ? (
                <img
                  src={dev.profileImage}
                  alt={dev.username || dev.name || "개발자"}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
                  {(dev.username || dev.name || "?")[0].toUpperCase()}
                </span>
              )}
            </div>

            {/* 닉네임 */}
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>
              {dev.username || dev.name || "개발자"}
            </div>

            {/* 실명 (닉네임과 다를 경우) */}
            {dev.username && dev.name && dev.username !== dev.name && (
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                {dev.name}
              </div>
            )}

            {/* 자기소개 */}
            {dev.bio && (
              <div style={{
                fontSize: 11, color: "#94a3b8", lineHeight: 1.6,
                marginTop: 6,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical" as const,
                overflow: "hidden",
              }}>
                {dev.bio}
              </div>
            )}

            {/* 앱 수 + 주목 배지 */}
            <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" as const, justifyContent: "center" }}>
              {(dev as any).appCount > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "2px 7px", borderRadius: 20,
                  background: "rgba(16,185,129,0.15)", color: "#10b981",
                  fontSize: 10, fontWeight: 600,
                }}>
                  📱 {(dev as any).appCount}개 앱
                </span>
              )}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 20,
                background: `${accentColor}20`, color: accentColor,
                fontSize: 10, fontWeight: 600,
              }}>
                <Star size={8} fill={accentColor} />
                주목 개발자
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
