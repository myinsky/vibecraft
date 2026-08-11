/**
 * Footer 컴포넌트
 *
 * - 브랜드 로고 + 사이트 제목/부제목 (DB siteConfig)
 * - 카테고리 링크 (DB navItems, 헤더와 동일)
 * - 정책 섹션 (DB siteConfig: policyPrivacyUrl, policyTermsUrl, policyAdUrl, policyPartnerUrl)
 * - 문의 섹션 (DB siteConfig: contactEmail, contactHours)
 * - 저작권 텍스트 (DB siteConfig: footerText)
 */

import { trpc } from "@/lib/trpc";
import { useSiteConfig } from "@/contexts/SiteConfigContext";
import { Link } from "wouter";
import { useState } from "react";
import DonationModal from "./DonationModal";

const FOOTER_QUERY_OPTS = { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false } as const;

export default function Footer() {
  // SiteConfigContext에서 공유 데이터 읽기 (중복 네트워크 요청 방지)
  const { siteConfig, navItemsData } = useSiteConfig();
  const { data: donationSettings } = trpc.donations.getSettings.useQuery(undefined, FOOTER_QUERY_OPTS);
  const [showDonationModal, setShowDonationModal] = useState(false);

  const navItems = (navItemsData ?? []).filter((item) => item.visible !== false);
  const year = new Date().getFullYear();
  const copyrightText =
    siteConfig?.footerText ??
    `© ${year} ${siteConfig?.siteTitle ?? "Smart Auto Guide"}. All rights reserved.`;

  const policyLinks = [
    { label: "사이트 소개", url: "/about" },
    { label: "개인정보처리방침", url: siteConfig?.policyPrivacyUrl ?? "/privacy" },
    { label: "이용약관",         url: siteConfig?.policyTermsUrl   ?? "/terms" },
    { label: "광고 문의",        url: "/advertise" },
  ];

  const linkStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    color: "#6b7280",
    textDecoration: "none",
    marginBottom: 7,
    transition: "color 0.15s",
  };

  return (
    <footer
      style={{
        background: "#f9fafb",
        borderTop: "1px solid #e5e7eb",
        marginTop: 20,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "32px 16px 20px",
        }}
      >
        {/* 상단 그리드: 브랜드 | 카테고리 | 정책 | 문의 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 32,
            marginBottom: 28,
          }}
        >
          {/* 브랜드 */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 900,
                  color: "white",
                  flexShrink: 0,
                }}
              >
                {siteConfig?.logoText ? siteConfig.logoText.slice(0, 2) : "V"}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                  {siteConfig?.siteTitle ?? "Smart Auto Guide"}
                </div>
                <div style={{ fontSize: 10, color: "#6366f1" }}>
                  {siteConfig?.siteSubtitle ?? "+ Vibe Coding"}
                </div>
              </div>
            </div>
            {siteConfig?.siteDescription && (
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.7,
                  maxWidth: 260,
                }}
              >
                {siteConfig.siteDescription}
              </p>
            )}
          </div>

          {/* 카테고리 (DB navItems) */}
          <div>
            <h4
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#6366f1",
                marginBottom: 12,
                letterSpacing: "0.5px",
              }}
            >
              카테고리
            </h4>
            {navItems.map((item) => {
              const isExternal =
                !!item.path && (
                item.path.startsWith("http://") ||
                item.path.startsWith("https://"));
              if (isExternal) {
                return (
                  <a
                    key={item.id ?? item.label}
                    href={item.path ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#6b7280")
                    }
                  >
                    {item.label}
                  </a>
                );
              }
              return (
                <Link
                  key={item.id ?? item.label}
                  href={item.path ?? "/"}
                  style={linkStyle}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#6b7280")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* 정책 */}
          <div>
            <h4
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#6366f1",
                marginBottom: 12,
                letterSpacing: "0.5px",
              }}
            >
              정책
            </h4>
            {policyLinks.map((link) => {
              const isExternal =
                link.url.startsWith("http://") ||
                link.url.startsWith("https://") ||
                link.url.startsWith("mailto:");
              if (isExternal) {
                return (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.color = "#6b7280")
                    }
                  >
                    {link.label}
                  </a>
                );
              }
              return (
                <Link
                  key={link.label}
                  href={link.url}
                  style={linkStyle}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#a5b4fc")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.color = "#6b7280")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* 문의 - h4 제목 제거, 커피한잔+문의하기를 최상단에 바로 배치 */}
          <div>
            {/* 후원하기 (커피 한 잔 쏘기) - donationEnabled일 때만 표시 */}
            {donationSettings?.enabled && (
              <div style={{
                marginBottom: 14,
                paddingBottom: 14,
                borderBottom: "1px solid #e5e7eb",
              }}>
                <button
                  onClick={() => setShowDonationModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: "#92400e",
                    fontWeight: 700,
                    padding: "6px 14px",
                    border: "1.5px solid #d97706",
                    borderRadius: 6,
                    background: "#fffbeb",
                    cursor: "pointer",
                    transition: "background 0.15s",
                    marginBottom: 8,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#fef3c7")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fffbeb")}
                >
                  ☕ 커피 한 잔 쏘기
                </button>
                <div style={{ fontSize: 11, color: "#6b7280" }}>
                  {donationSettings.description || "블로그 운영에 힘이 됩니다 ☕"}
                </div>
              </div>
            )}

            {/* 이메일 주소는 보안상 노출하지 않음 - 문의하기 버튼으로 대체 */}
            {siteConfig?.contactHours && (
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                운영시간: {siteConfig.contactHours}
              </div>
            )}
            <a
              href="/contact"
              style={{
                display: "inline-block",
                fontSize: 12,
                color: "#6366f1",
                fontWeight: 600,
                padding: "5px 12px",
                border: "1px solid #6366f1",
                borderRadius: 6,
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#6366f120")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              문의하기 →
            </a>
          </div>
        </div>

        {/* 후원 모달 */}
        {showDonationModal && donationSettings && (
          <DonationModal
            settings={donationSettings}
            onClose={() => setShowDonationModal(false)}
          />
        )}

        {/* 하단: 저작권 */}
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 11, color: "#6b7280" }}>
            {copyrightText}
          </span>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </footer>
  );
}
