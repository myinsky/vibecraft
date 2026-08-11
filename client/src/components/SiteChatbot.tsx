/**
 * SiteChatbot - 사이트 전체 AI 챗봇 플로팅 버튼 컴포넌트
 * - 우측 하단 플로팅 버튼으로 챗봇 팝업 열기
 * - 로그인 사용자: 대화 기록 자동 저장, 이전 대화 목록 패널, 불러오기/삭제
 * - 비로그인 사용자: 세션 내 임시 대화만 가능
 */
import { useState, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import {
  MessageCircle, X, Minimize2, History, Plus, Trash2, ChevronLeft, Loader2,
} from "lucide-react";
import type { Message } from "./AIChatBox";
// AIChatBox를 lazy로 로드하여 streamdown+shiki 번들(612KB)을 체팅버튼 클릭 시에만 로드
// 이로 인해 초기 페이지 TBT/FCP 크게 개선
const AIChatBox = lazy(() => import("./AIChatBox").then(m => ({ default: m.AIChatBox })));
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const SUGGESTED_PROMPTS = [
  "AI 바이브 코딩이 뭔가요?",
  "추천 AI 도구가 있나요?",
  "자동화 프로그램 어떻게 만드나요?",
  "블로그 운영 팁 알려주세요",
];

type PanelView = "chat" | "history";

// SiteChatbot의 실제 렌더링을 유휴 시점까지 지연하는 래퍼
export default function SiteChatbot() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // 첫 페이지 렌더링 이후 브라우저 유휴 시점에 마운트 (FCP/LCP 개선)
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(() => setMounted(true), { timeout: 3000 });
      return () => (window as any).cancelIdleCallback(id);
    } else {
      const t = setTimeout(() => setMounted(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);
  if (!mounted) return null;
  return <SiteChatbotInner />;
}

function SiteChatbotInner() {
  const { isAuthenticated, user } = useAuth();
  const [pathname] = useLocation();
  const isAdminPage = pathname.startsWith("/admin");
  const [isOpen, setIsOpen] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utils = trpc.useUtils();

  // 세션 목록 (로그인 사용자만)
  const { data: sessions, isLoading: sessionsLoading } = trpc.chatbot.listSessions.useQuery(
    undefined,
    { enabled: !!isAuthenticated && isOpen && panelView === "history" }
  );

  const chatMutation = trpc.chatbot.chat.useMutation({
    onSuccess: (response) => {
      setMessages((prev) => {
        const updated = [...prev, { role: "assistant" as const, content: response }];
        // 로그인 사용자: 자동 저장 (디바운스 1.5초)
        if (isAuthenticated) scheduleAutoSave(updated);
        return updated;
      });
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, content: "죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      ]);
    },
  });

  const saveSessionMutation = trpc.chatbot.saveSession.useMutation({
    onSuccess: (data) => {
      setCurrentSessionId(data.id);
      utils.chatbot.listSessions.invalidate();
    },
    onError: () => {
      toast.error("대화 저장에 실패했습니다.");
    },
    onSettled: () => setIsSaving(false),
  });

  const deleteSessionMutation = trpc.chatbot.deleteSession.useMutation({
    onSuccess: () => utils.chatbot.listSessions.invalidate(),
    onError: () => toast.error("대화 삭제에 실패했습니다."),
  });

  // 대화 자동 저장 (디바운스)
  const scheduleAutoSave = useCallback((msgs: Message[]) => {
    if (!isAuthenticated) return;
    const userMsgs = msgs.filter(m => m.role !== "system");
    if (userMsgs.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setIsSaving(true);
      // 첫 번째 사용자 메시지를 제목으로 사용
      const firstUser = userMsgs.find(m => m.role === "user");
      const title = firstUser
        ? firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? "..." : "")
        : "새 대화";
      saveSessionMutation.mutate({
        id: currentSessionId,
        title,
        messages: JSON.stringify(userMsgs),
      });
    }, 1500);
  }, [isAuthenticated, currentSessionId, saveSessionMutation]);

  const handleSendMessage = (content: string) => {
    const newMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(newMessages);
    chatMutation.mutate({ messages: newMessages });
  };

  // 새 대화 시작
  const handleNewChat = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setMessages([]);
    setCurrentSessionId(undefined);
    setPanelView("chat");
  };

  // 이전 대화 불러오기
  const handleLoadSession = async (sessionId: number) => {
    try {
      const session = await utils.chatbot.getSession.fetch({ id: sessionId });
      const parsed: Message[] = JSON.parse(session.messages || "[]");
      setMessages(parsed);
      setCurrentSessionId(sessionId);
      setPanelView("chat");
    } catch {
      toast.error("대화를 불러오지 못했습니다. 다시 시도해 주세요.");
    }
  };

  // 팝업 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-chatbot-toggle]")) {
          setIsOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* 챗봇 팝업 */}
      {isOpen && (
        <div
          ref={popupRef}
          style={{
            position: "fixed",
            bottom: 88,
            right: 24,
            width: 360,
            height: 540,
            zIndex: 9998,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 8px 24px rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.2)",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
          }}
        >
          {/* 챗봇 헤더 */}
          <div style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {panelView === "history" && (
                <button
                  onClick={() => setPanelView("chat")}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 24, height: 24, borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    border: "none", cursor: "pointer", color: "#fff",
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {panelView === "history" ? <History size={14} color="#fff" /> : <MessageCircle size={14} color="#fff" />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                  {panelView === "history" ? "대화 기록" : "Smart Auto Guide AI"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
                  {panelView === "history"
                    ? "이전 대화를 불러오세요"
                    : isSaving ? "저장 중..." : isAuthenticated ? "대화가 자동 저장됩니다" : "무엇이든 물어보세요"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* 새 대화 버튼 */}
              {panelView === "chat" && messages.length > 0 && (
                <button
                  onClick={handleNewChat}
                  title="새 대화 시작"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    border: "none", cursor: "pointer", color: "#fff",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}
                >
                  <Plus size={13} />
                </button>
              )}
              {/* 대화 기록 버튼 (로그인 사용자만) */}
              {isAuthenticated && panelView === "chat" && (
                <button
                  onClick={() => setPanelView("history")}
                  title="대화 기록 보기"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: "50%",
                    background: "rgba(255,255,255,0.15)",
                    border: "none", cursor: "pointer", color: "#fff",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}
                >
                  <History size={13} />
                </button>
              )}
              {/* 닫기 버튼 */}
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(255,255,255,0.15)",
                  border: "none", cursor: "pointer", color: "#fff",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.15)"; }}
              >
                <Minimize2 size={13} />
              </button>
            </div>
          </div>

          {/* 패널 내용 */}
          {panelView === "chat" ? (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} /></div>}>
                <AIChatBox
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  isLoading={chatMutation.isPending}
                  placeholder="질문을 입력하세요..."
                  height="100%"
                  emptyStateMessage="안녕하세요! Smart Auto Guide AI입니다. 블로그 관련 궁금한 점을 물어보세요."
                  suggestedPrompts={SUGGESTED_PROMPTS}
                />
              </Suspense>
            </div>
          ) : (
            /* 대화 기록 패널 */
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {/* 새 대화 버튼 */}
              <button
                onClick={handleNewChat}
                style={{
                  width: "100%", padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(99,102,241,0.06)",
                  border: "1px dashed rgba(99,102,241,0.3)",
                  borderRadius: 10, cursor: "pointer",
                  fontSize: 13, fontWeight: 600, color: "#6366f1",
                  marginBottom: 12,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.12)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"; }}
              >
                <Plus size={14} /> 새 대화 시작
              </button>

              {sessionsLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0", color: "#9ca3af" }}>
                  <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                </div>
              ) : sessions && sessions.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...sessions].reverse().map((session) => (
                    <div
                      key={session.id}
                      style={{
                        display: "flex", alignItems: "center",
                        padding: "10px 12px",
                        background: currentSessionId === session.id ? "rgba(99,102,241,0.08)" : "#f9fafb",
                        border: `1px solid ${currentSessionId === session.id ? "rgba(99,102,241,0.25)" : "#e5e7eb"}`,
                        borderRadius: 10, cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (currentSessionId !== session.id)
                          (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                      }}
                      onMouseLeave={(e) => {
                        if (currentSessionId !== session.id)
                          (e.currentTarget as HTMLElement).style.background = "#f9fafb";
                      }}
                    >
                      <div
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => handleLoadSession(session.id)}
                      >
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: "#111827",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {session.title}
                        </div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                          {new Date(session.updatedAt).toLocaleDateString("ko-KR", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSessionMutation.mutate({ id: session.id });
                          if (currentSessionId === session.id) {
                            setMessages([]);
                            setCurrentSessionId(undefined);
                          }
                        }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 24, height: 24, borderRadius: 6,
                          background: "transparent", border: "none",
                          color: "#d1d5db", cursor: "pointer",
                          flexShrink: 0, marginLeft: 6,
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#d1d5db"; }}
                        title="삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#9ca3af" }}>
                  <History size={28} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                  <p style={{ fontSize: 13, margin: 0 }}>저장된 대화가 없습니다.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 플로팅 버튼 안내 문구 - 버튼 위쪽에 2줄로 표시 */}
      {!isOpen && !isAdminPage && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            right: 14,
            zIndex: 9999,
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "7px 12px",
            borderRadius: 14,
            boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
            whiteSpace: "nowrap",
            letterSpacing: "-0.2px",
            pointerEvents: "none",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          질문하시면<br />AI가 답변해 드려요!
          {/* 말풍선 꼬리 - 아래쪽 */}
          <span style={{
            position: "absolute",
            bottom: -7,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "8px solid #8b5cf6",
          }} />
        </div>
      )}
      {/* 플로팅 버튼 */}
      <button
        data-chatbot-toggle
        onClick={() => setIsOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: isOpen
            ? "#6b7280"
            : "linear-gradient(135deg, #6366f1, #8b5cf6)",
          border: "none",
          cursor: "pointer",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: isOpen
            ? "0 4px 16px rgba(107,114,128,0.4)"
            : "0 8px 24px rgba(99,102,241,0.4)",
          transition: "all 0.2s ease",
          transform: isOpen ? "scale(0.95)" : "scale(1)",
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.08)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(99,102,241,0.5)";
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.transform = isOpen ? "scale(0.95)" : "scale(1)";
          (e.currentTarget as HTMLElement).style.boxShadow = isOpen
            ? "0 4px 16px rgba(107,114,128,0.4)"
            : "0 8px 24px rgba(99,102,241,0.4)";
        }}
        title={isOpen ? "챗봇 닫기" : "AI 챗봇 열기"}
      >
        {isOpen ? (
          <X size={22} color="#fff" />
        ) : (
          <MessageCircle size={22} color="#fff" />
        )}
      </button>
    </>
  );
}
