import { useState } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "login" | "register";
}

export default function AuthModal({ isOpen, onClose, defaultTab = "login" }: AuthModalProps) {
  const [tab, setTab] = useState<"login" | "register">(defaultTab);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regPw2, setRegPw2] = useState("");

  if (!isOpen) return null;

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("로그인 기능은 백엔드 연동 후 사용 가능합니다.");
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (regPw !== regPw2) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    alert("회원가입 기능은 백엔드 연동 후 사용 가능합니다.");
  };

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.18s ease",
      }}
    >
      <div style={{
        background: "#13131f",
        border: "1px solid #2a2a45",
        borderRadius: 16,
        width: "100%",
        maxWidth: 420,
        boxShadow: "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15)",
        overflow: "hidden",
        animation: "slideUp 0.22s ease",
      }}>

        {/* Header */}
        <div style={{
          padding: "22px 24px 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 900, color: "#fff",
              boxShadow: "0 0 12px rgba(99,102,241,0.4)",
            }}>S</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f1f5f9", lineHeight: 1.2 }}>Smart Auto Guide</div>
              <div style={{ fontSize: 10, color: "#818cf8" }}>+ Vibe Coding</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#6b7280", padding: 6, borderRadius: 6,
              display: "flex", alignItems: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#1e2040"; (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "#6b7280"; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Download notice */}
        <div style={{
          margin: "16px 24px 0",
          background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 10,
          padding: "11px 14px",
          display: "flex", alignItems: "flex-start", gap: 10,
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", marginBottom: 2 }}>
              자료 다운로드는 회원 전용입니다
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
              무료 회원가입 후 모든 자료를 제한 없이 다운로드하세요.
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", margin: "18px 24px 0",
          background: "#0d0d1a", borderRadius: 10, padding: 4,
          border: "1px solid #1e2040",
        }}>
          {(["login", "register"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "8px 0",
                background: tab === t ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "none",
                border: "none", borderRadius: 7,
                fontSize: 13, fontWeight: 700,
                color: tab === t ? "#fff" : "#6b7280",
                cursor: "pointer",
                transition: "all 0.18s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                boxShadow: tab === t ? "0 2px 10px rgba(99,102,241,0.35)" : "none",
              }}
            >
              {t === "login" ? <><LogIn size={14} />로그인</> : <><UserPlus size={14} />회원가입</>}
            </button>
          ))}
        </div>

        {/* Form */}
        <div style={{ padding: "20px 24px 24px" }}>
          {tab === "login" ? (
            <form onSubmit={handleLoginSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Email */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>이메일</label>
                <div style={{ position: "relative" }}>
                  <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type="email" required
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="example@email.com"
                    style={{
                      width: "100%", padding: "10px 12px 10px 36px",
                      background: "#0d0d1a", border: "1px solid #2a2a45",
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#2a2a45"}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>비밀번호</label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type={showPw ? "text" : "password"} required
                    value={loginPw}
                    onChange={e => setLoginPw(e.target.value)}
                    placeholder="비밀번호 입력"
                    style={{
                      width: "100%", padding: "10px 40px 10px 36px",
                      background: "#0d0d1a", border: "1px solid #2a2a45",
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#2a2a45"}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#4b5563", padding: 2,
                  }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <a href="#" style={{ fontSize: 11, color: "#818cf8", textDecoration: "none" }}>비밀번호를 잊으셨나요?</a>
              </div>

              <button type="submit" style={{
                width: "100%", padding: "11px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 9,
                fontSize: 14, fontWeight: 700, color: "#fff",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                transition: "opacity 0.15s, transform 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                로그인
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: "#1e2040" }} />
                <span style={{ fontSize: 11, color: "#4b5563" }}>또는</span>
                <div style={{ flex: 1, height: 1, background: "#1e2040" }} />
              </div>

              {/* Social */}
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { label: "Google", bg: "#fff", color: "#333", icon: "G" },
                  { label: "카카오", bg: "#FEE500", color: "#3C1E1E", icon: "K" },
                  { label: "네이버", bg: "#03C75A", color: "#fff", icon: "N" },
                ].map(s => (
                  <button key={s.label} type="button" style={{
                    flex: 1, padding: "9px 0",
                    background: s.bg, border: "none", borderRadius: 8,
                    fontSize: 12, fontWeight: 700, color: s.color,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    transition: "opacity 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                  >
                    <span style={{ fontWeight: 900 }}>{s.icon}</span>{s.label}
                  </button>
                ))}
              </div>

              <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
                계정이 없으신가요?{" "}
                <button type="button" onClick={() => setTab("register")} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#818cf8", fontWeight: 700, fontSize: 12, padding: 0,
                }}>무료 회원가입</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {/* Name */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>닉네임</label>
                <div style={{ position: "relative" }}>
                  <User size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type="text" required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="사용할 닉네임"
                    style={{
                      width: "100%", padding: "10px 12px 10px 36px",
                      background: "#0d0d1a", border: "1px solid #2a2a45",
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#2a2a45"}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>이메일</label>
                <div style={{ position: "relative" }}>
                  <Mail size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type="email" required
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="example@email.com"
                    style={{
                      width: "100%", padding: "10px 12px 10px 36px",
                      background: "#0d0d1a", border: "1px solid #2a2a45",
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#2a2a45"}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>비밀번호</label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type={showPw ? "text" : "password"} required
                    value={regPw}
                    onChange={e => setRegPw(e.target.value)}
                    placeholder="8자 이상 입력"
                    minLength={8}
                    style={{
                      width: "100%", padding: "10px 40px 10px 36px",
                      background: "#0d0d1a", border: "1px solid #2a2a45",
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#2a2a45"}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#4b5563", padding: 2,
                  }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Password confirm */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>비밀번호 확인</label>
                <div style={{ position: "relative" }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
                  <input
                    type={showPw2 ? "text" : "password"} required
                    value={regPw2}
                    onChange={e => setRegPw2(e.target.value)}
                    placeholder="비밀번호 재입력"
                    style={{
                      width: "100%", padding: "10px 40px 10px 36px",
                      background: "#0d0d1a",
                      border: `1px solid ${regPw2 && regPw !== regPw2 ? "#ef4444" : "#2a2a45"}`,
                      borderRadius: 8, fontSize: 13, color: "#e2e8f0",
                      outline: "none", boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = regPw2 && regPw !== regPw2 ? "#ef4444" : "#2a2a45"}
                  />
                  <button type="button" onClick={() => setShowPw2(!showPw2)} style={{
                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#4b5563", padding: 2,
                  }}>
                    {showPw2 ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {regPw2 && regPw !== regPw2 && (
                  <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>비밀번호가 일치하지 않습니다.</div>
                )}
              </div>

              {/* Terms */}
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" required style={{ marginTop: 2, accentColor: "#6366f1" }} />
                <span style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
                  <a href="#" style={{ color: "#818cf8", textDecoration: "none" }}>이용약관</a> 및{" "}
                  <a href="#" style={{ color: "#818cf8", textDecoration: "none" }}>개인정보처리방침</a>에 동의합니다.
                </span>
              </label>

              <button type="submit" style={{
                width: "100%", padding: "11px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 9,
                fontSize: 14, fontWeight: 700, color: "#fff",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(99,102,241,0.4)",
                transition: "opacity 0.15s, transform 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                무료 회원가입
              </button>

              <div style={{ textAlign: "center", fontSize: 12, color: "#6b7280" }}>
                이미 계정이 있으신가요?{" "}
                <button type="button" onClick={() => setTab("login")} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "#818cf8", fontWeight: 700, fontSize: 12, padding: 0,
                }}>로그인</button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
