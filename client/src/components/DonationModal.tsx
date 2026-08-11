/**
 * DonationModal - 커피 한 잔 쏘기 (후원하기) 모달
 * - 계좌 정보 표시 (은행명/계좌번호/예금주) → 비회원도 열람 가능
 * - 후원자명/금액/메시지 입력 후 입금 완료 알림 등록 → 로그인 회원만 가능
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

interface DonationSettings {
  enabled: boolean;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  description: string;
  kakaoId: string;
}

interface Props {
  settings: DonationSettings;
  onClose: () => void;
}

export default function DonationModal({ settings, onClose }: Props) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [step, setStep] = useState<"info" | "form" | "done">("info");
  const [donorName, setDonorName] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const createMutation = trpc.donations.create.useMutation({
    onSuccess: () => setStep("done"),
  });

  const handleCopyAccount = () => {
    const text = `${settings.bankName} ${settings.accountNumber} ${settings.accountHolder}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setShowToast(true);
      setTimeout(() => setCopied(false), 2000);
      setTimeout(() => setShowToast(false), 2500);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) return;
    const amountNum = parseInt(amount.replace(/,/g, ""), 10);
    if (!donorName.trim()) return;
    createMutation.mutate({
      donorName: donorName.trim(),
      amount: isNaN(amountNum) ? 0 : amountNum,
      message: message.trim() || undefined,
    });
  };

  const PRESET_AMOUNTS = [3000, 5000, 10000, 20000, 50000];

  const modal = (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff",
        borderRadius: 16,
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          background: "linear-gradient(135deg, #f59e0b, #d97706)",
          padding: "20px 24px 16px",
          position: "relative",
        }}>
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12,
              background: "rgba(255,255,255,0.2)", border: "none",
              borderRadius: "50%", width: 28, height: 28,
              cursor: "pointer", color: "#fff", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >×</button>
          <div style={{ fontSize: 28, marginBottom: 4 }}>☕</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>커피 한 잔 쏘기</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
            {settings.description || "블로그 운영에 힘이 됩니다!"}
          </div>
        </div>

        {/* 본문 */}
        <div style={{ padding: "20px 24px" }}>
          {step === "info" && (
            <>
              {/* 계좌 정보 - 비회원도 열람 가능 */}
              {(settings.bankName || settings.accountNumber) && (
                <div style={{
                  background: "#fffbeb",
                  border: "1.5px solid #fcd34d",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 16,
                }}>
                  <div style={{ fontSize: 11, color: "#92400e", fontWeight: 700, marginBottom: 8 }}>
                    계좌 정보
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {settings.bankName && (
                      <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                        <span style={{ color: "#6b7280", minWidth: 50 }}>은행</span>
                        <span style={{ fontWeight: 700, color: "#1f2937" }}>{settings.bankName}</span>
                      </div>
                    )}
                    {settings.accountNumber && (
                      <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                        <span style={{ color: "#6b7280", minWidth: 50 }}>계좌</span>
                        <span style={{ fontWeight: 700, color: "#1f2937", letterSpacing: "0.5px" }}>{settings.accountNumber}</span>
                      </div>
                    )}
                    {settings.accountHolder && (
                      <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
                        <span style={{ color: "#6b7280", minWidth: 50 }}>예금주</span>
                        <span style={{ fontWeight: 700, color: "#1f2937" }}>{settings.accountHolder}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCopyAccount}
                    style={{
                      marginTop: 10, width: "100%",
                      background: copied ? "#d1fae5" : "#fff",
                      border: "1px solid #d97706",
                      borderRadius: 6, padding: "7px 0",
                      fontSize: 12, fontWeight: 600,
                      color: copied ? "#065f46" : "#92400e",
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                  >
                    {copied ? "✓ 복사됨!" : "계좌번호 복사"}
                  </button>
                </div>
              )}

              {/* 카카오페이 */}
              {settings.kakaoId && (
                <div style={{
                  background: "#fef9c3",
                  border: "1.5px solid #fde047",
                  borderRadius: 10,
                  padding: "12px 16px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>💛</span>
                  <div>
                    <div style={{ fontSize: 11, color: "#713f12", fontWeight: 700 }}>카카오페이</div>
                    <div style={{ fontSize: 13, color: "#1f2937", fontWeight: 600 }}>{settings.kakaoId}</div>
                  </div>
                </div>
              )}

              {/* 입금 완료 알리기 버튼 - 로그인 여부에 따라 분기 */}
              <div style={{ display: "flex", gap: 8 }}>
                {authLoading ? (
                  <button
                    disabled
                    style={{
                      flex: 1, padding: "10px 0",
                      background: "#d1d5db", border: "none",
                      borderRadius: 8, color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "not-allowed",
                    }}
                  >
                    로딩 중...
                  </button>
                ) : isAuthenticated ? (
                  <button
                    onClick={() => setStep("form")}
                    style={{
                      flex: 1, padding: "10px 0",
                      background: "#f59e0b", border: "none",
                      borderRadius: 8, color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    입금 완료 알리기
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      window.location.href = getLoginUrl(window.location.pathname);
                    }}
                    style={{
                      flex: 1, padding: "10px 0",
                      background: "#6366f1", border: "none",
                      borderRadius: 8, color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    🔐 로그인 후 입금 알리기
                  </button>
                )}
                <button
                  onClick={onClose}
                  style={{
                    padding: "10px 16px",
                    background: "#f3f4f6", border: "none",
                    borderRadius: 8, color: "#6b7280",
                    fontSize: 13, cursor: "pointer",
                  }}
                >
                  닫기
                </button>
              </div>

              {/* 비회원 안내 문구 */}
              {!authLoading && !isAuthenticated && (
                <div style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "#0369a1",
                  lineHeight: 1.5,
                }}>
                  계좌 정보는 누구나 확인할 수 있습니다.<br />
                  입금 완료 알림은 <strong>로그인 회원만</strong> 이용 가능합니다.
                </div>
              )}
            </>
          )}

          {step === "form" && (
            <>
              {/* 비회원이 직접 URL로 접근하는 경우 방어 */}
              {!isAuthenticated ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1f2937", marginBottom: 8 }}>
                    로그인이 필요합니다
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
                    입금 완료 알림은 로그인 회원만 이용할 수 있습니다.
                  </div>
                  <button
                    onClick={() => { window.location.href = getLoginUrl(window.location.pathname); }}
                    style={{
                      padding: "10px 24px",
                      background: "#6366f1", border: "none",
                      borderRadius: 8, color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    로그인하기
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                      후원자명 <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={donorName}
                      onChange={e => setDonorName(e.target.value)}
                      placeholder="이름 또는 닉네임"
                      required
                      style={{
                        width: "100%", padding: "8px 12px",
                        border: "1.5px solid #d1d5db", borderRadius: 6,
                        fontSize: 13, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                      후원 금액
                    </label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                      {PRESET_AMOUNTS.map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAmount(a.toLocaleString())}
                          style={{
                            padding: "4px 10px",
                            border: amount === a.toLocaleString() ? "1.5px solid #f59e0b" : "1px solid #d1d5db",
                            borderRadius: 5, fontSize: 11,
                            background: amount === a.toLocaleString() ? "#fffbeb" : "#fff",
                            color: amount === a.toLocaleString() ? "#92400e" : "#6b7280",
                            cursor: "pointer", fontWeight: 600,
                          }}
                        >
                          {a.toLocaleString()}원
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="직접 입력 (원)"
                      style={{
                        width: "100%", padding: "8px 12px",
                        border: "1.5px solid #d1d5db", borderRadius: 6,
                        fontSize: 13, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>
                      메시지 (선택)
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      placeholder="응원 메시지를 남겨주세요 😊"
                      rows={2}
                      style={{
                        width: "100%", padding: "8px 12px",
                        border: "1.5px solid #d1d5db", borderRadius: 6,
                        fontSize: 13, outline: "none", resize: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      style={{
                        flex: 1, padding: "10px 0",
                        background: createMutation.isPending ? "#d1d5db" : "#f59e0b",
                        border: "none", borderRadius: 8,
                        color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {createMutation.isPending ? "등록 중..." : "입금 완료 알리기"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("info")}
                      style={{
                        padding: "10px 16px",
                        background: "#f3f4f6", border: "none",
                        borderRadius: 8, color: "#6b7280",
                        fontSize: 13, cursor: "pointer",
                      }}
                    >
                      뒤로
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1f2937", marginBottom: 8 }}>
                감사합니다!
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
                후원 알림이 등록되었습니다.<br />
                입금 확인 후 감사 인사를 드릴게요 ☕
              </div>
              <button
                onClick={onClose}
                style={{
                  padding: "10px 32px",
                  background: "#f59e0b", border: "none",
                  borderRadius: 8, color: "#fff",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const toast = showToast ? createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        background: "#1f2937",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        animation: "fadeInUp 0.25s ease",
      }}
    >
      <span style={{ fontSize: 16 }}>✓</span>
      계좌번호가 복사되었습니다
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  ) : null;

  return <>{createPortal(modal, document.body)}{toast}</>;
}
