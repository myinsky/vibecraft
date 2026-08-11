import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Loader2, CheckCircle2, XCircle, UserCircle2, ArrowLeft,
  Mail, Calendar, Code2, Upload, Star, Pencil, Save, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
export default function MyProfilePage() {
  const [, setLocation] = useLocation();
  const { user, loading, refresh } = useAuth();

  // 닉네임 변경
  const [username, setUsername] = useState("");
  const [checkResult, setCheckResult] = useState<"idle" | "checking" | "available" | "taken" | "same">("idle");
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // 프로필 편집
  const [editingProfile, setEditingProfile] = useState(false);
  const [bio, setBio] = useState("");
  const [profileImage, setProfileImage] = useState("");

  // 개발자 등록 모달
  const [showDevRegister, setShowDevRegister] = useState(false);
  const [devBio, setDevBio] = useState("");
  const [devProfileImage, setDevProfileImage] = useState("");

  const userExt = user as any;

  useEffect(() => {
    if (user) {
      setUsername(userExt.username || "");
      setBio(userExt.bio || "");
      setProfileImage(userExt.profileImage || "");
    }
  }, [user]);

  const checkQuery = trpc.auth.checkUsername.useQuery(
    { username },
    { enabled: false }
  );

  const setUsernameMutation = trpc.auth.setUsername.useMutation({
    onSuccess: () => {
      toast.success("닉네임이 변경되었습니다!");
      refresh();
    },
    onError: (err) => {
      if (err.message.includes("이미 사용 중")) {
        setCheckResult("taken");
        toast.error("이미 사용 중인 닉네임입니다.");
      } else {
        toast.error(err.message || "닉네임 변경에 실패했습니다.");
      }
    },
  });

  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("프로필이 업데이트되었습니다!");
      setEditingProfile(false);
      refresh();
    },
    onError: (err) => {
      toast.error(err.message || "프로필 업데이트에 실패했습니다.");
    },
  });

  const registerDeveloperMutation = trpc.auth.registerDeveloper.useMutation({
    onSuccess: () => {
      toast.success("개발자로 등록되었습니다! 🎉 이제 앱을 등록해보세요.", {
        action: {
          label: "앱 등록하기 →",
          onClick: () => { window.location.href = "/submit-app"; },
        },
        duration: 6000,
      });
      setShowDevRegister(false);
      refresh();
    },
    onError: (err) => {
      toast.error(err.message || "개발자 등록에 실패했습니다.");
    },
  });

  // 닉네임 디바운스 중복 확인
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const currentUsername = userExt?.username || "";
    if (!username || username.length < 2) {
      setCheckResult("idle");
      return;
    }
    if (username === currentUsername) {
      setCheckResult("same");
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

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>로그인이 필요합니다</div>
        <div style={{ fontSize: 14, color: "#6b7280", textAlign: "center" }}>프로필 페이지는 로그인 후 이용할 수 있습니다.</div>
        <a
          href={getLoginUrl("/my-profile")}
          style={{ padding: "10px 28px", borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          회원가입 / 로그인
        </a>
      </div>
    );
  }

  const isValid = /^[가-힣a-zA-Z0-9_]{2,20}$/.test(username);
  const currentUsername = userExt?.username || "";
  const isSame = username === currentUsername;
  const canSubmit = isValid && (checkResult === "available" || checkResult === "same") && !isSame && !setUsernameMutation.isPending;

  const handleUsernameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setUsernameMutation.mutate({ username });
  };

  const handleProfileSave = () => {
    updateProfileMutation.mutate({ bio: bio || null, profileImage: profileImage || null });
  };

  const handleDevRegister = () => {
    registerDeveloperMutation.mutate({
      bio: devBio || undefined,
      profileImage: devProfileImage || undefined,
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", paddingTop: 32, paddingBottom: 64 }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>

        {/* 뒤로가기 */}
        <button
          onClick={() => setLocation("/")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: "#6b7280", fontWeight: 500,
            marginBottom: 20, padding: "4px 0",
          }}
        >
          <ArrowLeft size={15} /> 홈으로 돌아가기
        </button>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>내 정보 수정</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>프로필 정보를 확인하고 수정할 수 있습니다.</p>
        </div>

        {/* 계정 정보 카드 */}
        <Card style={{ marginBottom: 20, border: "1px solid #e5e7eb" }}>
          <CardHeader style={{ paddingBottom: 12 }}>
            <CardTitle style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
              <UserCircle2 size={18} style={{ color: "#6366f1" }} />
              계정 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* 아바타 + 이름 */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative" }}>
                  {userExt?.profileImage ? (
                    <img
                      src={userExt.profileImage}
                      alt="프로필"
                      style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #e5e7eb" }}
                    />
                  ) : (
                    <div style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>
                      {(userExt?.username || user?.name || "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>
                    {userExt?.username || user?.name || "사용자"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {user?.role === "admin" && (
                      <Badge variant="secondary" style={{ fontSize: 10, background: "#ede9fe", color: "#6366f1" }}>관리자</Badge>
                    )}
                    {userExt?.isDeveloper && (
                      <Badge variant="secondary" style={{ fontSize: 10, background: "#d1fae5", color: "#059669" }}>
                        <Code2 size={10} style={{ marginRight: 3 }} />개발자
                      </Badge>
                    )}
                    {userExt?.isFeaturedDeveloper && (
                      <Badge variant="secondary" style={{ fontSize: 10, background: "#fef3c7", color: "#d97706" }}>
                        <Star size={10} style={{ marginRight: 3 }} />주목 개발자
                      </Badge>
                    )}
                    {!userExt?.isDeveloper && user?.role !== "admin" && (
                      <Badge variant="secondary" style={{ fontSize: 10 }}>일반 회원</Badge>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* 이메일 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Mail size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>이메일 (로그인 계정)</div>
                  <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{user?.email || "—"}</div>
                </div>
              </div>

              {/* 가입일 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Calendar size={14} style={{ color: "#9ca3af", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>가입일</div>
                  <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                    {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                  </div>
                </div>
              </div>

              {/* bio */}
              {userExt?.bio && (
                <div style={{ fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                  {userExt.bio}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 프로필 편집 카드 */}
        <Card style={{ marginBottom: 20, border: "1px solid #e5e7eb" }}>
          <CardHeader style={{ paddingBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <CardTitle style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
                <Pencil size={16} style={{ color: "#6366f1" }} />
                프로필 편집
              </CardTitle>
              {!editingProfile && (
                <Button variant="outline" size="sm" onClick={() => setEditingProfile(true)} style={{ fontSize: 12, height: 30 }}>
                  수정
                </Button>
              )}
            </div>
            <CardDescription style={{ fontSize: 12 }}>자기소개와 프로필 이미지를 설정합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {editingProfile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>자기소개 (최대 500자)</label>
                  <Textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="간단한 자기소개를 입력해주세요 (예: AI 자동화 앱 개발자, 바이브코딩 애호가)"
                    rows={3}
                    maxLength={500}
                  />
                  <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "right", marginTop: 2 }}>{bio.length}/500</div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>프로필 이미지 URL</label>
                  <Input
                    value={profileImage}
                    onChange={e => setProfileImage(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                  />
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>이미지 URL을 직접 입력하거나 비워두면 이니셜 아바타가 사용됩니다.</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    onClick={handleProfileSave}
                    disabled={updateProfileMutation.isPending}
                    style={{ flex: 1, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontWeight: 700, fontSize: 14, height: 40 }}
                  >
                    {updateProfileMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</> : <><Save size={14} className="mr-2" />저장</>}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditingProfile(false); setBio(userExt?.bio || ""); setProfileImage(userExt?.profileImage || ""); }} style={{ height: 40 }}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {userExt?.bio ? (
                  <p style={{ margin: 0, lineHeight: 1.6 }}>{userExt.bio}</p>
                ) : (
                  <p style={{ margin: 0, color: "#9ca3af" }}>아직 자기소개가 없습니다. 수정 버튼을 눌러 추가해보세요.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 닉네임 변경 카드 */}
        <Card style={{ marginBottom: 20, border: "1px solid #e5e7eb" }}>
          <CardHeader style={{ paddingBottom: 12 }}>
            <CardTitle style={{ fontSize: 15 }}>닉네임 변경</CardTitle>
            <CardDescription style={{ fontSize: 12 }}>
              사이트에서 표시될 닉네임을 변경합니다. 한글, 영문, 숫자, 언더스코어(_) 2~20자.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUsernameSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {currentUsername && (
                <div style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", borderRadius: 6, padding: "8px 12px" }}>
                  현재 닉네임: <strong style={{ color: "#374151" }}>{currentUsername}</strong>
                </div>
              )}
              <div style={{ position: "relative" }}>
                <Input
                  type="text"
                  placeholder="새 닉네임 입력 (예: 홍길동, user123)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={20}
                  style={{
                    paddingRight: 36,
                    borderColor:
                      checkResult === "available" ? "#22c55e"
                        : checkResult === "taken" ? "#ef4444"
                        : checkResult === "same" ? "#d1d5db"
                        : undefined,
                  }}
                />
                <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                  {checkResult === "checking" && <Loader2 size={16} className="animate-spin text-gray-400" />}
                  {checkResult === "available" && <CheckCircle2 size={16} style={{ color: "#22c55e" }} />}
                  {checkResult === "taken" && <XCircle size={16} style={{ color: "#ef4444" }} />}
                </div>
              </div>
              {checkResult === "available" && <p style={{ fontSize: 12, color: "#22c55e", margin: 0 }}>✓ 사용 가능한 닉네임입니다.</p>}
              {checkResult === "taken" && <p style={{ fontSize: 12, color: "#ef4444", margin: 0 }}>✗ 이미 사용 중인 닉네임입니다.</p>}
              {checkResult === "same" && <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>현재 사용 중인 닉네임과 동일합니다.</p>}
              {username.length > 0 && !isValid && (
                <p style={{ fontSize: 12, color: "#f59e0b", margin: 0 }}>
                  한글, 영문, 숫자, 언더스코어(_)만 사용 가능하며 2~20자여야 합니다.
                </p>
              )}
              <Button
                type="submit"
                disabled={!canSubmit}
                style={{
                  marginTop: 4,
                  background: canSubmit ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : undefined,
                  fontWeight: 700, fontSize: 14, height: 42,
                }}
              >
                {setUsernameMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />변경 중...</> : "닉네임 변경 저장"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 개발자 등록 카드 */}
        {!userExt?.isDeveloper && (
          <Card style={{ border: "1px solid #d1fae5", background: "#f0fdf4" }}>
            <CardHeader style={{ paddingBottom: 12 }}>
              <CardTitle style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 8, color: "#059669" }}>
                <Code2 size={18} />
                개발자 등록
              </CardTitle>
              <CardDescription style={{ fontSize: 12 }}>
                개발자로 등록하면 앱을 등록 신청하고 개발자 프로필 페이지가 생성됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!showDevRegister ? (
                <Button
                  onClick={() => setShowDevRegister(true)}
                  style={{ background: "linear-gradient(135deg, #059669, #10b981)", fontWeight: 700, fontSize: 14, height: 42, width: "100%" }}
                >
                  <Code2 size={16} className="mr-2" />
                  개발자로 등록하기
                </Button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>자기소개 (선택)</label>
                    <Textarea
                      value={devBio}
                      onChange={e => setDevBio(e.target.value)}
                      placeholder="개발자 소개를 입력해주세요 (예: AI 자동화 앱 개발자, 바이브코딩 애호가)"
                      rows={3}
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>프로필 이미지 URL (선택)</label>
                    <Input
                      value={devProfileImage}
                      onChange={e => setDevProfileImage(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      onClick={handleDevRegister}
                      disabled={registerDeveloperMutation.isPending}
                      style={{ flex: 1, background: "linear-gradient(135deg, #059669, #10b981)", fontWeight: 700, fontSize: 14, height: 42 }}
                    >
                      {registerDeveloperMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />등록 중...</> : "개발자 등록 완료"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowDevRegister(false)} style={{ height: 42 }}>취소</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 이미 개발자인 경우 */}
        {userExt?.isDeveloper && (
          <Card style={{ border: "1px solid #d1fae5", background: "#f0fdf4" }}>
            <CardContent style={{ paddingTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Code2 size={18} style={{ color: "#059669" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>개발자로 등록되어 있습니다</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {userExt?.developerRegisteredAt
                      ? `등록일: ${new Date(userExt.developerRegisteredAt).toLocaleDateString("ko-KR")}`
                      : "앱 등록 신청 및 개발자 프로필 페이지를 이용할 수 있습니다."}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* 앱 등록 CTA */}
                <div style={{ background: "linear-gradient(135deg, #ede9fe, #dbeafe)", borderRadius: 12, padding: "14px 16px", border: "1.5px solid #c4b5fd" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#4c1d95", marginBottom: 4 }}>🚀 다음 단계: 앱 등록하기</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10, lineHeight: 1.5 }}>바이브코딩으로 만든 앱을 커뮤니티에 공개하고 첫 사용자를 만나보세요.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button asChild style={{ background: "#5B5BF6", color: "white", fontSize: 13, height: 36, borderRadius: 9 }}>
                      <a href="/submit-app">📦 앱 등록 신청하기</a>
                    </Button>
                    <Button asChild variant="outline" style={{ fontSize: 12, height: 36, borderRadius: 9 }}>
                      <a href="/page/page21" target="_blank">앱쇼룸 보기</a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
