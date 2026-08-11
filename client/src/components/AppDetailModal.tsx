import { useState } from "react";
import { X, Download, ExternalLink, Star, ChevronRight, CheckCircle, LogIn } from "lucide-react";
import type { VibeApp } from "../data/blogData";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useDownloadWithProgress, formatEta, formatBytes } from "@/hooks/useDownloadWithProgress";

interface Props {
  app: VibeApp | null;
  onClose: () => void;
}

type Tab = "intro" | "usage" | "reviews";

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          fill={i <= Math.round(rating) ? "#f59e0b" : "none"}
          color={i <= Math.round(rating) ? "#f59e0b" : "#374151"}
        />
      ))}
    </span>
  );
}

export default function AppDetailModal({ app, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("intro");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);

  const { user, isAuthenticated } = useAuth();
  // 다운로드 권한: 관리자 또는 canDownload 허용된 회원만 가능
  const canDownload = isAuthenticated && !user?.isBanned && (user?.role === "admin" || user?.canDownload !== false);

  // DB 리뷰 목록 조회 (앱이 있을 때만)
  const { data: dbReviews, refetch: refetchReviews } = trpc.apps.reviews.list.useQuery(
    { appId: app?.id ?? 0 },
    { enabled: !!app && tab === "reviews" }
  );

  // 다운로드 진행률 훅
  const { progress: dlProgress, download: startDownload, reset: resetDownload } = useDownloadWithProgress();

  // 다운로드 뮤테이션 (URL 취득 후 스트리밍 다운로드 시작)
  const downloadMutation = trpc.apps.download.useMutation({
    onSuccess: async (data) => {
      if (data.downloadUrl) {
        // 원본 파일명 우선 사용 (DB에 저장된 originalFilename)
        // 없으면 URL에 ?download=1&filename= 파라미터로 서버에서 Content-Disposition 처리
        const originalFilename = data.originalFilename || null;
        let downloadUrl = data.downloadUrl;
        if (data.downloadUrl.startsWith('/manus-storage/') && originalFilename) {
          downloadUrl = `${data.downloadUrl}?download=1&filename=${encodeURIComponent(originalFilename)}`;
        } else if (data.downloadUrl.startsWith('/manus-storage/')) {
          downloadUrl = `${data.downloadUrl}?download=1`;
        }
        // 파일명: originalFilename 우선, 없으면 앱 이름 사용
        const filename = originalFilename || app?.name || "download";
        // 스트리밍 다운로드로 진행률 + 남은 시간 표시
        await startDownload(downloadUrl, filename);
      } else {
        toast.info("다운로드 링크를 준비 중입니다.");
      }
    },
    onError: () => {
      toast.error("다운로드 중 오류가 발생했습니다.");
    },
  });

  // 리뷰 등록 뮤테이션
  const createReviewMutation = trpc.apps.reviews.create.useMutation({
    onSuccess: () => {
      toast.success("리뷰가 등록되었습니다!");
      setReviewText("");
      setReviewRating(5);
      refetchReviews();
    },
    onError: () => {
      toast.error("리뷰 등록 중 오류가 발생했습니다.");
    },
  });

  if (!app) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (!canDownload) {
      toast.error("다운로드 권한이 없습니다. 관리자에게 문의하세요.");
      return;
    }
    downloadMutation.mutate({ appId: app.id });
  };

  const handleReviewSubmit = () => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    if (!reviewText.trim()) {
      toast.warning("리뷰 내용을 입력해주세요.");
      return;
    }
    createReviewMutation.mutate({
      appId: app.id,
      rating: reviewRating,
      content: reviewText.trim(),
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "intro", label: "앱 소개" },
    { key: "usage", label: "사용 방법" },
    { key: "reviews", label: `리뷰 (${app.reviewCount})` },
  ];

  // 표시할 리뷰: DB 리뷰가 있으면 DB 리뷰, 없으면 정적 샘플 리뷰
  const displayReviews = dbReviews && dbReviews.length > 0 ? dbReviews : app.reviews;

  return (
    <>
      <div
        onClick={handleBackdrop}
        style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(5px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
          animation: "fadeIn 0.18s ease",
        }}
      >
        <div style={{
          background: "#ffffff",
          border: "1px solid #2a2a45",
          borderRadius: 16,
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
          overflow: "hidden",
          animation: "slideUp 0.22s ease",
        }}>

          {/* Hero image */}
          <div style={{ position: "relative", height: 180, flexShrink: 0 }}>
            <img
              src={app.image}
              alt={app.name}
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, rgba(13,13,26,0.3) 0%, rgba(13,13,26,0.85) 100%)",
            }} />
            {/* Close */}
            <button onClick={onClose} style={{
              position: "absolute", top: 12, right: 12,
              background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: 6, cursor: "pointer",
              color: "#111827", display: "flex", alignItems: "center",
            }}>
              <X size={16} />
            </button>
            {/* Badge */}
            {app.badge && (
              <span style={{
                position: "absolute", top: 12, left: 12,
                background: app.categoryColor, color: "#fff",
                fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 4,
              }}>{app.badge}</span>
            )}
            {/* App title overlay */}
            <div style={{ position: "absolute", bottom: 14, left: 18, right: 18, display: "flex", alignItems: "flex-end", gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 12,
                background: "linear-gradient(135deg, #1e1b4b, #3730a3)",
                border: "2px solid rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
              }}>{app.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", lineHeight: 1.2 }}>{app.name}</div>
                <div style={{ fontSize: 12, color: "#c4c9d8", marginTop: 2 }}>{app.tagline}</div>
              </div>
            </div>
          </div>

          {/* Meta bar */}
          <div style={{
            padding: "10px 20px",
            background: "#ffffff",
            borderBottom: "1px solid #1e2040",
            display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
            flexShrink: 0,
          }}>
            <span style={{
              background: app.categoryColor + "22", color: app.categoryColor,
              fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 4,
            }}>{app.category}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <StarRating rating={app.rating} size={12} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>{app.rating}</span>
              <span style={{ fontSize: 11, color: "#6b7280" }}>({app.reviewCount})</span>
            </div>
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              <span style={{ color: "#6366f1", fontWeight: 600 }}>{(app.downloads / 1000).toFixed(1)}K</span> 다운로드
            </span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{app.version}</span>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{app.releaseDate}</span>

            {/* Action buttons */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {app.demoUrl && (
                <a href={app.demoUrl} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 13px", borderRadius: 7,
                  border: "1px solid #2a2a45", background: "#ffffff",
                  fontSize: 12, fontWeight: 600, color: "#6b7280", textDecoration: "none",
                }}>
                  <ExternalLink size={12} /> 데모
                </a>
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <a
                  href="#"
                  onClick={handleDownload}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "6px 14px", borderRadius: 7,
                    background: isAuthenticated
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "linear-gradient(135deg, #374151, #4b5563)",
                    border: "none", fontSize: 12, fontWeight: 700, color: "#fff",
                    textDecoration: "none", cursor: "pointer",
                    boxShadow: isAuthenticated ? "0 2px 10px rgba(99,102,241,0.35)" : "none",
                    opacity: (downloadMutation.isPending || dlProgress.status === "downloading") ? 0.7 : 1,
                    pointerEvents: dlProgress.status === "downloading" ? "none" : "auto",
                  }}
                >
                  {isAuthenticated ? (
                    <><Download size={12} /> {(downloadMutation.isPending || dlProgress.status === "downloading") ? "다운로드 중..." : dlProgress.status === "done" ? "다운로드 완료" : "다운로드"}</>
                  ) : (
                    <><LogIn size={12} /> 로그인 후 다운로드</>
                  )}
                </a>

                {/* 다운로드 진행률 표시 */}
                {dlProgress.status === "downloading" && (
                  <div style={{ minWidth: 200, display: "flex", flexDirection: "column", gap: 4 }}>
                    {/* 프로그레스 바 */}
                    {dlProgress.total > 0 && (
                      <div style={{
                        height: 4, background: "rgba(99,102,241,0.2)",
                        borderRadius: 2, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${dlProgress.percent}%`,
                          background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                          borderRadius: 2,
                          transition: "width 0.3s ease",
                        }} />
                      </div>
                    )}
                    {/* 진행률 텍스트 */}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280" }}>
                      <span>
                        {dlProgress.total > 0
                          ? `${dlProgress.percent}% (${formatBytes(dlProgress.loaded)} / ${formatBytes(dlProgress.total)})`
                          : `${formatBytes(dlProgress.loaded)} 다운로드 중`
                        }
                      </span>
                      <span style={{ color: "#6366f1", fontWeight: 600 }}>
                        남은 시간: {formatEta(dlProgress.etaSeconds)}
                      </span>
                    </div>
                  </div>
                )}

                {/* 다운로드 완료 메시지 */}
                {dlProgress.status === "done" && (
                  <div style={{ fontSize: 10, color: "#10b981", fontWeight: 600 }}>
                    ✓ 다운로드 완료
                  </div>
                )}

                {/* 오류 메시지 */}
                {dlProgress.status === "error" && (
                  <div style={{ fontSize: 10, color: "#ef4444" }}>
                    오류: {dlProgress.error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{
            display: "flex", borderBottom: "1px solid #1e2040",
            background: "#ffffff", flexShrink: 0,
          }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "11px 20px",
                background: "none", border: "none",
                fontSize: 13, fontWeight: 700,
                color: tab === t.key ? "#6366f1" : "#6b7280",
                cursor: "pointer",
                borderBottom: tab === t.key ? "2px solid #6366f1" : "2px solid transparent",
                transition: "color 0.15s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Tab content - scrollable */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>

            {/* INTRO TAB */}
            {tab === "intro" && (
              <div>
                <p style={{ fontSize: 13, color: "#c4c9d8", lineHeight: 1.8, marginBottom: 22 }}>
                  {app.description}
                </p>

                {/* Tech stack */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>기술 스택</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {app.techStack.map(t => (
                      <span key={t} style={{
                        background: "#1e1e35", border: "1px solid #2a2a45",
                        color: "#6366f1", fontSize: 11, fontWeight: 600,
                        padding: "4px 11px", borderRadius: 6,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>주요 기능</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {app.features.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                        <CheckCircle size={15} color="#6366f1" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* USAGE TAB */}
            {tab === "usage" && (
              <div>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
                  아래 단계를 순서대로 따라하면 누구나 쉽게 사용할 수 있습니다.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {app.usageSteps.map((s, i) => (
                    <div key={s.step} style={{ display: "flex", gap: 16, position: "relative" }}>
                      {/* Connector line */}
                      {i < app.usageSteps.length - 1 && (
                        <div style={{
                          position: "absolute", left: 19, top: 40, bottom: 0,
                          width: 2, background: "linear-gradient(to bottom, #3730a3, #1e2040)",
                        }} />
                      )}
                      {/* Step number */}
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 900, color: "#fff",
                        boxShadow: "0 0 12px rgba(99,102,241,0.35)",
                        zIndex: 1,
                      }}>{s.step}</div>
                      {/* Content */}
                      <div style={{ flex: 1, paddingBottom: 24 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 5, paddingTop: 8 }}>
                          {s.title}
                        </div>
                        <div style={{
                          fontSize: 13, color: "#6b7280", lineHeight: 1.7,
                          background: "#ffffff", border: "1px solid #1e2040",
                          borderRadius: 8, padding: "10px 14px",
                        }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* REVIEWS TAB */}
            {tab === "reviews" && (
              <div>
                {/* Rating summary */}
                <div style={{
                  background: "#ffffff", border: "1px solid #1e2040",
                  borderRadius: 12, padding: "16px 20px", marginBottom: 20,
                  display: "flex", alignItems: "center", gap: 24,
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{app.rating}</div>
                    <StarRating rating={app.rating} size={16} />
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{app.reviewCount}개 리뷰</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    {[5, 4, 3, 2, 1].map(star => {
                      const count = app.reviews.filter(r => r.rating === star).length;
                      const pct = app.reviews.length > 0 ? (count / app.reviews.length) * 100 : 0;
                      return (
                        <div key={star} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "#6b7280", width: 14, textAlign: "right" }}>{star}</span>
                          <Star size={10} fill="#f59e0b" color="#f59e0b" />
                          <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b", borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 10, color: "#6b7280", width: 16 }}>{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Existing reviews */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                  {(displayReviews as Array<{
                    id: number;
                    author?: string;
                    userName?: string | null;
                    avatar?: string;
                    rating: number;
                    content: string;
                    date?: string;
                    createdAt?: Date;
                  }>).map(r => {
                    const authorName = r.author || r.userName || "익명";
                    const avatarChar = authorName.charAt(0);
                    const dateStr = r.date || (r.createdAt ? new Date(r.createdAt).toLocaleDateString("ko-KR") : "");
                    return (
                      <div key={r.id} style={{
                        background: "#ffffff", border: "1px solid #1e2040",
                        borderRadius: 10, padding: "14px 16px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0,
                          }}>{avatarChar}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{authorName}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <StarRating rating={r.rating} size={11} />
                              <span style={{ fontSize: 10, color: "#6b7280" }}>{dateStr}</span>
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>{r.content}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Write review */}
                <div style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.05))",
                  border: "1px solid rgba(99,102,241,0.2)",
                  borderRadius: 12, padding: "16px 18px",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1", marginBottom: 12 }}>리뷰 작성</div>

                  {!isAuthenticated ? (
                    /* 비로그인 상태: 로그인 유도 */
                    <div style={{
                      textAlign: "center", padding: "20px 0",
                      color: "#6b7280", fontSize: 13,
                    }}>
                      <div style={{ marginBottom: 12 }}>리뷰를 작성하려면 로그인이 필요합니다.</div>
                      <button
                        onClick={() => { window.location.href = getLoginUrl(); }}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 7,
                          padding: "9px 22px", borderRadius: 8,
                          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                          border: "none", fontSize: 13, fontWeight: 700, color: "#fff",
                          cursor: "pointer",
                          boxShadow: "0 2px 10px rgba(99,102,241,0.3)",
                        }}
                      >
                        <LogIn size={14} /> 로그인하고 리뷰 작성하기
                      </button>
                    </div>
                  ) : (
                    /* 로그인 상태: 리뷰 작성 폼 */
                    <>
                      {/* Star selector */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>평점:</span>
                        {[1, 2, 3, 4, 5].map(s => (
                          <button key={s} type="button"
                            onMouseEnter={() => setHoverRating(s)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setReviewRating(s)}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                            <Star
                              size={20}
                              fill={s <= (hoverRating || reviewRating) ? "#f59e0b" : "none"}
                              color={s <= (hoverRating || reviewRating) ? "#f59e0b" : "#374151"}
                            />
                          </button>
                        ))}
                        <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>{reviewRating}점</span>
                      </div>
                      <textarea
                        value={reviewText}
                        onChange={e => setReviewText(e.target.value)}
                        placeholder="사용 후기를 남겨주세요. 다른 사용자에게 큰 도움이 됩니다."
                        rows={3}
                        style={{
                          width: "100%", padding: "10px 12px",
                          background: "#ffffff", border: "1px solid #2a2a45",
                          borderRadius: 8, fontSize: 13, color: "#111827",
                          outline: "none", resize: "vertical", boxSizing: "border-box",
                          fontFamily: "inherit", lineHeight: 1.6,
                        }}
                        onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                        onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button
                          onClick={handleReviewSubmit}
                          disabled={createReviewMutation.isPending}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "8px 18px", borderRadius: 8,
                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            border: "none", fontSize: 13, fontWeight: 700, color: "#fff",
                            cursor: createReviewMutation.isPending ? "not-allowed" : "pointer",
                            opacity: createReviewMutation.isPending ? 0.7 : 1,
                            boxShadow: "0 2px 10px rgba(99,102,241,0.3)",
                          }}>
                          <ChevronRight size={14} />
                          {createReviewMutation.isPending ? "등록 중..." : "리뷰 등록"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </>
  );
}
