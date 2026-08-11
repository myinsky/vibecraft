/**
 * SocialShareDialog - 글 게시 완료 후 소셜 미디어 공유 팝업
 * 지원 플랫폼: 카카오톡, 트위터(X), 페이스북, 네이버 블로그, 스레드, 링크 복사
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, Share2 } from "lucide-react";

interface SocialShareDialogProps {
  open: boolean;
  onClose: () => void;
  postId: number;
  slug?: string | null; // SEO 슬러그 (있으면 /p/:slug, 없으면 /post/:id)
  title: string;
  description?: string;
  thumbnail?: string;
  siteUrl?: string;
}

export default function SocialShareDialog({
  open,
  onClose,
  postId,
  slug,
  title,
  description = "",
  thumbnail = "",
  siteUrl = "https://vibecraftx.com",
}: SocialShareDialogProps) {
  const [copied, setCopied] = useState(false);

  // slug가 있으면 /p/:slug, 없으면 /post/:id 사용
  // encodeURIComponent는 소셜 공유 URL 파라미터에만 사용, 실제 postUrl은 그대로 구성
  const postPath = slug ? `/p/${slug}` : `/post/${postId}`;
  const postUrl = `${siteUrl.replace(/\/$/, "")}${postPath}`;
  // 소셜 공유 API 파라미터용 인코딩
  const encodedUrl = encodeURIComponent(postUrl);
  const encodedTitle = encodeURIComponent(title);
  // 표시용: 한글 등 유니코드는 디코딩해서 읽기 쉽게 표시
  const displayUrl = (() => {
    try { return decodeURIComponent(postUrl); } catch { return postUrl; }
  })();

  // ── 카카오톡 공유 ──────────────────────────────────────────────
  const handleKakao = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakao = (window as any).Kakao;
    if (!kakao) {
      toast.error("카카오 SDK를 불러오지 못했습니다.");
      return;
    }
    if (!kakao.isInitialized()) {
      kakao.init(import.meta.env.VITE_KAKAO_JS_KEY || "");
    }
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title,
        description: description || title,
        ...(thumbnail ? { imageUrl: thumbnail } : {}),
        link: { mobileWebUrl: postUrl, webUrl: postUrl },
      },
      buttons: [
        { title: "글 보러가기", link: { mobileWebUrl: postUrl, webUrl: postUrl } },
      ],
    });
  };

  // ── 트위터(X) 공유 ─────────────────────────────────────────────
  const handleTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  // ── 페이스북 공유 ──────────────────────────────────────────────
  const handleFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    window.open(url, "_blank", "width=600,height=400");
  };

  // ── 네이버 블로그 공유 ─────────────────────────────────────────
  const handleNaver = () => {
    const url = `https://share.naver.com/web/shareView?url=${encodedUrl}&title=${encodedTitle}`;
    window.open(url, "_blank", "width=600,height=600");
  };

  // ── 스레드(Threads) 공유 ───────────────────────────────────────
  const handleThreads = () => {
    const url = `https://www.threads.net/intent/post?text=${encodedTitle}%20${encodedUrl}`;
    window.open(url, "_blank", "width=600,height=600");
  };

  // ── 링크 복사 ──────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      toast.success("링크가 복사되었습니다!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  // ── 게시물 바로 보기 ───────────────────────────────────────────
  const handleViewPost = () => {
    onClose();
    window.location.href = postUrl;
  };

  // 2열 배치 플랫폼 (4개)
  const gridPlatforms = [
    {
      key: "kakao",
      label: "카카오톡",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <ellipse cx="12" cy="11.5" rx="10" ry="8.5" fill="#FEE500" />
          <path d="M12 5.5C7.86 5.5 4.5 8.08 4.5 11.27c0 2.02 1.34 3.8 3.37 4.84l-.86 3.17 3.7-2.44c.41.06.83.09 1.29.09 4.14 0 7.5-2.58 7.5-5.77S16.14 5.5 12 5.5z" fill="#3A1D1D" />
        </svg>
      ),
      bg: "#FEE500",
      color: "#3A1D1D",
      onClick: handleKakao,
    },
    {
      key: "twitter",
      label: "트위터(X)",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      bg: "#000000",
      color: "#ffffff",
      onClick: handleTwitter,
    },
    {
      key: "facebook",
      label: "페이스북",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      bg: "#1877F2",
      color: "#ffffff",
      onClick: handleFacebook,
    },
    {
      key: "naver",
      label: "네이버 블로그",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
        </svg>
      ),
      bg: "#03C75A",
      color: "#ffffff",
      onClick: handleNaver,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent style={{
        maxWidth: 460,
        width: "calc(100vw - 32px)",
        borderRadius: 16,
        padding: "24px 24px 20px",
        fontFamily: "'Noto Sans KR', sans-serif",
        boxSizing: "border-box",
      }}>
        <DialogHeader style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Share2 size={18} color="#fff" />
            </div>
            <DialogTitle style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: 0 }}>
              글이 게시되었습니다! 🎉
            </DialogTitle>
          </div>
          <DialogDescription style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
            소셜 미디어에 공유하여 더 많은 독자에게 알려보세요.
          </DialogDescription>
        </DialogHeader>

        {/* 게시글 미리보기 */}
        <div style={{
          background: "#f9fafb", border: "1px solid #e5e7eb",
          borderRadius: 10, padding: "12px 14px", marginBottom: 16,
          display: "flex", gap: 12, alignItems: "center",
          overflow: "hidden",
        }}>
          {thumbnail && (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: 52, height: 52, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
            />
          )}
          <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#111827",
              overflow: "hidden", textOverflow: "ellipsis",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {title}
            </div>
            <div style={{
              fontSize: 11, color: "#9ca3af", marginTop: 4,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {displayUrl}
            </div>
          </div>
        </div>

        {/* 소셜 플랫폼 버튼 - 2열 그리드 (4개) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          {gridPlatforms.map(p => (
            <button
              key={p.key}
              onClick={p.onClick}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "10px 12px", borderRadius: 10, border: "none",
                background: p.bg, color: p.color,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "opacity 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {p.icon}
              {p.label}
            </button>
          ))}
        </div>

        {/* 스레드 - 전체 너비 */}
        <button
          onClick={handleThreads}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "10px 12px", borderRadius: 10, border: "none",
            background: "#000000", color: "#ffffff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "opacity 0.15s", marginBottom: 12,
            boxSizing: "border-box",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.284 2.651Z" />
          </svg>
          스레드(Threads)
        </button>

        {/* 링크 복사 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#f3f4f6", borderRadius: 10, padding: "10px 12px",
          marginBottom: 14, overflow: "hidden",
        }}>
          <span style={{
            flex: 1, fontSize: 12, color: "#6b7280",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0,
          }}>
            {displayUrl}
          </span>
          <button
            onClick={handleCopy}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, border: "none",
              background: copied ? "#10b981" : "#6366f1",
              color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "background 0.2s", flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "복사됨" : "링크 복사"}
          </button>
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            onClick={onClose}
            style={{ flex: 1, fontSize: 13, borderRadius: 10 }}
          >
            나중에 공유
          </Button>
          <Button
            onClick={handleViewPost}
            style={{ flex: 1, fontSize: 13, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            <ExternalLink size={13} style={{ marginRight: 6 }} />
            게시물 보기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
