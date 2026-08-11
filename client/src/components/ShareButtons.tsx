/**
 * ShareButtons - 소셜 미디어 공유 버튼 컴포넌트
 *
 * 지원 채널:
 * - 트위터(X): 웹 인텐트 URL로 새 탭 오픈
 * - 페이스북: sharer.php URL로 새 탭 오픈
 * - 카카오톡: Kakao.Share.sendDefault API (SDK 필요)
 * - 링크 복사: Clipboard API + 토스트 알림
 *
 * 사용법:
 *   <ShareButtons
 *     url={window.location.href}
 *     title={post.title}
 *     description={post.excerpt}
 *     imageUrl={post.thumbnail}
 *   />
 */

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Check } from "lucide-react";

interface ShareButtonsProps {
  /** 공유할 URL (기본값: window.location.href) */
  url?: string;
  /** 게시물 제목 */
  title?: string;
  /** 게시물 요약 (카카오톡 공유 시 사용) */
  description?: string;
  /** 썸네일 이미지 URL (카카오톡 공유 시 사용) */
  imageUrl?: string | null;
  /** 컨테이너 추가 클래스 */
  className?: string;
}

// 카카오 SDK는 window를 any로 타입 캐스팅하여 사용 (타입 충돌 방지)

// ─── 공유 URL 생성 헬퍼 ──────────────────────────────────────────────────────

function buildTwitterUrl(url: string, title: string): string {
  const params = new URLSearchParams({
    text: title,
    url,
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function buildFacebookUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

// ─── 개별 버튼 컴포넌트 ──────────────────────────────────────────────────────

interface SocialBtnProps {
  onClick: () => void;
  label: string;
  ariaLabel: string;
  bgColor: string;
  hoverBgColor: string;
  textColor: string;
  borderColor?: string;
  icon: React.ReactNode;
}

function SocialBtn({
  onClick,
  label,
  ariaLabel,
  bgColor,
  hoverBgColor,
  textColor,
  borderColor,
  icon,
}: SocialBtnProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 8,
        background: hovered ? hoverBgColor : bgColor,
        border: borderColor ? `1px solid ${borderColor}` : "none",
        fontSize: 14,
        fontWeight: 700,
        color: textColor,
        cursor: "pointer",
        transition: "background 0.15s, transform 0.1s, box-shadow 0.15s",
        boxShadow: hovered
          ? "0 4px 12px rgba(0,0,0,0.15)"
          : "0 2px 6px rgba(0,0,0,0.08)",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function ShareButtons({
  url,
  title = "",
  description = "",
  imageUrl,
  className,
}: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");

  // 트위터(X) 공유
  const handleTwitterShare = () => {
    window.open(buildTwitterUrl(shareUrl, title), "_blank", "noopener,noreferrer,width=600,height=400");
  };

  // 페이스북 공유
  const handleFacebookShare = () => {
    window.open(buildFacebookUrl(shareUrl), "_blank", "noopener,noreferrer,width=600,height=400");
  };

  // 카카오톡 공유
  const handleKakaoShare = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakao = (window as any).Kakao;
    if (!kakao) {
      toast.error("카카오 SDK를 불러오지 못했습니다.");
      return;
    }
    if (!kakao.isInitialized()) {
      const key = (import.meta as any).env?.VITE_KAKAO_JS_KEY || "";
      if (!key) {
        toast.error("카카오 앱 키가 설정되지 않았습니다.");
        return;
      }
      kakao.init(key);
    }
    const cleanDescription = description
      ? description.replace(/<[^>]+>/g, "").slice(0, 100)
      : "";

    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: title || "스마트 오토 가이드",
        description: cleanDescription,
        ...(imageUrl ? { imageUrl } : {}),
        link: {
          mobileWebUrl: shareUrl,
          webUrl: shareUrl,
        },
      },
      buttons: [
        {
          title: "글 보러가기",
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
      ],
    });
  };

  // 링크 복사
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("링크가 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 10,
      }}
    >
      {/* 트위터(X) */}
      <SocialBtn
        onClick={handleTwitterShare}
        label="X(트위터)"
        ariaLabel="트위터로 공유"
        bgColor="#000000"
        hoverBgColor="#1a1a1a"
        textColor="#ffffff"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        }
      />

      {/* 페이스북 */}
      <SocialBtn
        onClick={handleFacebookShare}
        label="페이스북"
        ariaLabel="페이스북으로 공유"
        bgColor="#1877F2"
        hoverBgColor="#0d65d8"
        textColor="#ffffff"
        icon={
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        }
      />

      {/* 카카오톡 */}
      <SocialBtn
        onClick={handleKakaoShare}
        label="카카오톡"
        ariaLabel="카카오톡으로 공유"
        bgColor="#FEE500"
        hoverBgColor="#f0d800"
        textColor="#3C1E1E"
        icon={
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <ellipse cx="9" cy="8" rx="8" ry="7" fill="#3C1E1E" />
            <path
              d="M9 3C5.686 3 3 5.134 3 7.75c0 1.682 1.09 3.155 2.72 3.99L5.1 13.5l2.41-1.58c.49.07.993.108 1.49.108 3.314 0 6-2.134 6-4.75S12.314 3 9 3z"
              fill="#FEE500"
            />
          </svg>
        }
      />

      {/* 링크 복사 */}
      <SocialBtn
        onClick={handleCopyLink}
        label={copied ? "복사됨!" : "링크 복사"}
        ariaLabel="링크 복사"
        bgColor={copied ? "#d1fae5" : "#f3f4f6"}
        hoverBgColor={copied ? "#a7f3d0" : "#e5e7eb"}
        textColor={copied ? "#065f46" : "#374151"}
        borderColor={copied ? "#6ee7b7" : "#d1d5db"}
        icon={
          copied ? (
            <Check size={16} color="#065f46" aria-hidden="true" />
          ) : (
            <Link2 size={16} aria-hidden="true" />
          )
        }
      />
    </div>
  );
}
