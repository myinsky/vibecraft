import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2, UserCircle2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * 첫 로그인 시 사이트 닉네임(username)을 설정하는 모달.
 * user.username이 null/undefined인 경우에만 표시됩니다.
 * 닫기 버튼 없이 강제 설정 (필수 단계).
 */
export default function UsernameSetupModal() {
  const { user, loading, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [checkResult, setCheckResult] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const checkQuery = trpc.auth.checkUsername.useQuery(
    { username },
    {
      enabled: false, // 수동으로 refetch
    }
  );

  const setUsernameMutation = trpc.auth.setUsername.useMutation({
    onSuccess: () => {
      toast.success("닉네임이 설정되었습니다!");
      refresh();
    },
    onError: (err) => {
      if (err.message.includes("이미 사용 중")) {
        setCheckResult("taken");
        toast.error("이미 사용 중인 닉네임입니다.");
      } else {
        toast.error(err.message || "닉네임 설정에 실패했습니다.");
      }
    },
  });

  // username 입력 시 디바운스 중복 확인
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!username || username.length < 2) {
      setCheckResult("idle");
      return;
    }
    setCheckResult("checking");
    const timer = setTimeout(async () => {
      try {
        const result = await checkQuery.refetch();
        if (result.data?.available) {
          setCheckResult("available");
        } else {
          setCheckResult("taken");
        }
      } catch {
        setCheckResult("idle");
      }
    }, 500);
    setDebounceTimer(timer);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  // 로딩 중이거나 미로그인이거나 이미 username이 있으면 렌더링 안 함
  if (loading) return null;
  if (!user) return null;
  if ((user as any).username) return null;

  const isValid = /^[가-힣a-zA-Z0-9_]{2,20}$/.test(username);
  const canSubmit = isValid && checkResult === "available" && !setUsernameMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setUsernameMutation.mutate({ username });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "36px 32px 28px",
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* 아이콘 */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              marginBottom: 12,
            }}
          >
            <UserCircle2 size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>
            닉네임을 설정해 주세요
          </h2>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6, lineHeight: 1.5 }}>
            사이트에서 사용할 닉네임을 입력해 주세요.
            <br />
            한글, 영문, 숫자, 언더스코어(_) 2~20자
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 닉네임 입력 */}
          <div style={{ position: "relative" }}>
            <Input
              type="text"
              placeholder="닉네임 입력 (예: 홍길동, user123)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              autoFocus
              style={{
                paddingRight: 36,
                borderColor:
                  checkResult === "available"
                    ? "#22c55e"
                    : checkResult === "taken"
                    ? "#ef4444"
                    : undefined,
              }}
            />
            {/* 상태 아이콘 */}
            <div
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              {checkResult === "checking" && (
                <Loader2 size={16} className="animate-spin text-gray-400" />
              )}
              {checkResult === "available" && (
                <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
              )}
              {checkResult === "taken" && (
                <XCircle size={16} style={{ color: "#ef4444" }} />
              )}
            </div>
          </div>

          {/* 상태 메시지 */}
          {checkResult === "available" && (
            <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>
              ✓ 사용 가능한 닉네임입니다.
            </p>
          )}
          {checkResult === "taken" && (
            <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>
              ✗ 이미 사용 중인 닉네임입니다.
            </p>
          )}
          {username.length > 0 && !isValid && (
            <p style={{ fontSize: 12, color: "#f59e0b", margin: 0 }}>
              한글, 영문, 숫자, 언더스코어(_)만 사용 가능하며 2~20자여야 합니다.
            </p>
          )}

          {/* 제출 버튼 */}
          <Button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 4,
              background: canSubmit
                ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                : undefined,
              fontWeight: 700,
              fontSize: 15,
              height: 44,
            }}
          >
            {setUsernameMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                설정 중...
              </>
            ) : (
              "닉네임 설정하고 시작하기"
            )}
          </Button>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}
