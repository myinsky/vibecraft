import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { adminSave, btnStyle, inputStyle, labelStyle, selectStyle, cardStyle, CATEGORY_LABELS, SECTION_ICONS, EMPTY_SIDEBAR_ITEM, type SidebarItemForm } from "./adminShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, GripVertical, Plus, Trash2, Edit2, Check, X,
  Settings, Layout, Sidebar, Navigation, FileText, ChevronUp, ChevronDown,
  Monitor, Palette, Globe, BarChart2, Save, RefreshCw, ExternalLink,
  MessageSquare, MessageCircleOff, Bot, Loader2, Zap, Key, BookOpen, Copy, AlertCircle, Send,
  Users, UserCheck, UserX, Shield, ShieldOff, Ban, Search, AlertTriangle, RotateCcw,
  Database, Download, Upload, HardDrive, Maximize2, Minimize2, Pin, PinOff,
  Heart, Coffee, CheckCircle, XCircle, ShoppingCart, TrendingUp,
} from "lucide-react";

export function CommentsTab() {
  const utils = trpc.useUtils();
  const { data: comments, isLoading, refetch } = trpc.admin.listAllComments.useQuery();

  const toggleVisibilityMutation = trpc.admin.toggleCommentVisibility.useMutation({
    onSuccess: () => {
      utils.admin.listAllComments.invalidate();
      toast.success("댓글 표시 상태가 변경되었습니다.");
    },
    onError: (err) => toast.error("변경 실패: " + err.message),
  });

  const deleteCommentMutation = trpc.admin.deleteComment.useMutation({
    onSuccess: () => {
      utils.admin.listAllComments.invalidate();
      toast.success("댓글이 삭제되었습니다.");
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const totalCount = comments?.length ?? 0;
  const hiddenCount = comments?.filter((c) => c.isHidden).length ?? 0;
  const aiRepliedCount = comments?.filter((c) => c.aiReply).length ?? 0;

  return (
    <div>
      {/* 헤더 */}
      <div style={{
        background: "#ffffff", border: "1px solid #e5e7eb",
        borderRadius: 12, padding: "20px 24px",
        marginBottom: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MessageSquare size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>댓글 관리</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              전체 {totalCount}개 · 숨김 {hiddenCount}개 · AI 답변 {aiRepliedCount}개
            </div>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8,
            background: "#f3f4f6", border: "1px solid #e5e7eb",
            fontSize: 12, fontWeight: 600, color: "#6b7280",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} /> 새로고침
        </button>
      </div>

      {/* 댓글 목록 */}
      {isLoading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 8, color: "#9ca3af" }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 14 }}>댓글을 불러오는 중...</span>
        </div>
      ) : !comments || comments.length === 0 ? (
        <div style={{
          background: "#ffffff", border: "1px solid #e5e7eb",
          borderRadius: 12, padding: "60px 24px",
          textAlign: "center", color: "#9ca3af",
        }}>
          <MessageSquare size={32} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
          <p style={{ fontSize: 14, margin: 0 }}>아직 댓글이 없습니다.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {comments.map((comment) => (
            <div
              key={comment.id}
              style={{
                background: comment.isHidden ? "#fafafa" : "#ffffff",
                border: `1px solid ${comment.isHidden ? "#f3f4f6" : "#e5e7eb"}`,
                borderRadius: 12,
                overflow: "hidden",
                opacity: comment.isHidden ? 0.7 : 1,
              }}
            >
              {/* 댓글 본문 */}
              <div style={{ padding: "14px 18px" }}>
                <div style={{
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 메타 정보 */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 8, flexWrap: "wrap",
                    }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: "#111827",
                      }}>{comment.userName}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        {new Date(comment.createdAt).toLocaleDateString("ko-KR", {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                      <span style={{
                        fontSize: 11, color: "#6b7280",
                        background: "#f3f4f6", padding: "2px 8px", borderRadius: 4,
                      }}>
                        포스트 #{comment.postId}
                      </span>
                      {comment.isHidden && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: "#f87171", background: "rgba(248,113,113,0.1)",
                          padding: "2px 8px", borderRadius: 4,
                        }}>숨김</span>
                      )}
                      {comment.aiReply && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: "#6366f1", background: "rgba(99,102,241,0.1)",
                          padding: "2px 8px", borderRadius: 4,
                          display: "flex", alignItems: "center", gap: 3,
                        }}>
                          <Bot size={10} /> AI 답변 완료
                        </span>
                      )}
                    </div>
                    {/* 댓글 내용 */}
                    <p style={{
                      fontSize: 14, color: "#374151",
                      lineHeight: 1.6, margin: 0,
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>{comment.content}</p>
                  </div>

                  {/* 액션 버튼 */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {/* 표시/숨김 토글 */}
                    <button
                      onClick={() => toggleVisibilityMutation.mutate({
                        id: comment.id,
                        isHidden: !comment.isHidden,
                      })}
                      disabled={toggleVisibilityMutation.isPending}
                      title={comment.isHidden ? "댓글 표시" : "댓글 숨김"}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 7,
                        background: comment.isHidden ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.1)",
                        border: `1px solid ${comment.isHidden ? "rgba(16,185,129,0.3)" : "rgba(107,114,128,0.2)"}`,
                        fontSize: 12, fontWeight: 600,
                        color: comment.isHidden ? "#10b981" : "#6b7280",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      {comment.isHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                      {comment.isHidden ? "표시" : "숨김"}
                    </button>
                    {/* 삭제 버튼 */}
                    <button
                      onClick={() => {
                        if (window.confirm("댓글을 삭제하시겠습니까?")) {
                          deleteCommentMutation.mutate({ id: comment.id });
                        }
                      }}
                      disabled={deleteCommentMutation.isPending}
                      title="댓글 삭제"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 12px", borderRadius: 7,
                        background: "rgba(248,113,113,0.1)",
                        border: "1px solid rgba(248,113,113,0.3)",
                        fontSize: 12, fontWeight: 600, color: "#f87171",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    >
                      <Trash2 size={12} /> 삭제
                    </button>
                  </div>
                </div>
              </div>

              {/* AI 답변 (있을 경우) */}
              {comment.aiReply && (
                <div style={{
                  padding: "12px 18px",
                  background: "rgba(99,102,241,0.04)",
                  borderTop: "1px solid rgba(99,102,241,0.1)",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    marginBottom: 6,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 20,
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    }}>
                      <Bot size={10} color="#fff" />
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#fff" }}>AI 답변</span>
                    </div>
                  </div>
                  <p style={{
                    fontSize: 13, color: "#4b5563",
                    lineHeight: 1.6, margin: 0,
                    whiteSpace: "pre-wrap",
                  }}>{comment.aiReply}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

