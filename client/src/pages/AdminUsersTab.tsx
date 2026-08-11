import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { inputStyle, labelStyle, cardStyle } from "./adminShared";
import {
  ChevronDown, Loader2, Save, Search, Shield, ShieldOff, Users, Crown, Star,
} from "lucide-react";

// 역할 표시 레이블 및 스타일
type UserRole = "user" | "admin" | "sub_admin";

function getRoleLabel(role: UserRole, isOwner: boolean): string {
  if (isOwner) return "관리자(최고)";
  if (role === "admin") return "관리자";
  if (role === "sub_admin") return "부관리자";
  return "일반";
}

function getRoleColor(role: UserRole, isOwner: boolean): string {
  if (isOwner) return "#7c3aed";
  if (role === "admin") return "#6366f1";
  if (role === "sub_admin") return "#0891b2";
  return "#6b7280";
}

function getRoleBg(role: UserRole, isOwner: boolean): string {
  if (isOwner) return "#f5f3ff";
  if (role === "admin") return "#eef2ff";
  if (role === "sub_admin") return "#ecfeff";
  return "#f3f4f6";
}

// 카테고리 권한 설정 서브컴포넌트
function CategoryPermissionsPanel({ userId, canWrite, isAdmin }: { userId: number; canWrite: boolean; isAdmin: boolean }) {
  const { data: navItems } = trpc.admin.getNavItems.useQuery();
  const { data: currentPerms, refetch: refetchPerms } = trpc.admin.getCategoryWritePermissions.useQuery({ userId });
  const setPerms = trpc.admin.setCategoryWritePermissions.useMutation({
    onSuccess: () => { toast.success("카테고리 권한이 저장되었습니다."); refetchPerms(); },
    onError: (e) => toast.error(e.message),
  });

  const [selected, setSelected] = useState<string[] | null>(null);

  // currentPerms가 로드되면 selected 초기화
  const effectiveSelected = selected ?? currentPerms ?? [];

  const categories = useMemo(() => {
    if (!navItems) return [];
    return navItems.filter((item: any) => item.type === "category" || !item.type);
  }, [navItems]);

  const toggleCategory = (key: string) => {
    const current = effectiveSelected;
    if (current.includes(key)) {
      setSelected(current.filter(k => k !== key));
    } else {
      setSelected([...current, key]);
    }
  };

  const savePerms = () => {
    setPerms.mutate({ userId, categoryKeys: effectiveSelected });
  };

  if (!canWrite && !isAdmin) {
    return (
      <div style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
        글쓰기 권한이 없는 회원입니다.
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div style={{ fontSize: 11, color: "#6366f1" }}>
        관리자는 모든 카테고리에 글쓰기 가능합니다.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
        허용할 카테고리를 선택하세요. 선택하지 않으면 모든 카테고리에 글쓰기 가능합니다.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {categories.map((cat: any) => {
          const isChecked = effectiveSelected.includes(cat.key);
          return (
            <button
              key={cat.key}
              onClick={() => toggleCategory(cat.key)}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                border: isChecked ? "2px solid #6366f1" : "1px solid #e5e7eb",
                background: isChecked ? "#eef2ff" : "#fff",
                color: isChecked ? "#6366f1" : "#6b7280",
                fontWeight: isChecked ? 700 : 400,
              }}
            >
              {cat.label || cat.key}
            </button>
          );
        })}
      </div>
      <button
        onClick={savePerms}
        disabled={setPerms.isPending}
        style={{
          padding: "6px 14px", background: "#6366f1", color: "#fff",
          border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        <Save size={11} />
        {setPerms.isPending ? "저장 중..." : "카테고리 권한 저장"}
      </button>
    </div>
  );
}

export function UsersTab() {
  const { data: userList, isLoading, refetch } = trpc.admin.listUsers.useQuery();
  const updatePerm = trpc.admin.updateUserPermissions.useMutation({
    onSuccess: () => { toast.success("권한이 업데이트되었습니다."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "sub_admin" | "user" | "banned">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [memoEdit, setMemoEdit] = useState<Record<number, string>>({});

  const filtered = useMemo(() => {
    if (!userList) return [];
    return userList.filter((u: any) => {
      const matchSearch = !search ||
        (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(search.toLowerCase());
      let matchRole = true;
      if (filterRole === "banned") matchRole = u.isBanned;
      else if (filterRole === "admin") matchRole = !u.isBanned && (u.role === "admin");
      else if (filterRole === "sub_admin") matchRole = !u.isBanned && u.role === "sub_admin";
      else if (filterRole === "user") matchRole = !u.isBanned && u.role === "user";
      return matchSearch && matchRole;
    });
  }, [userList, search, filterRole]);

  const toggle = (userId: number, field: "canWrite" | "canDownload" | "isBanned", current: boolean) => {
    updatePerm.mutate({ userId, [field]: !current });
  };

  const setRole = (userId: number, role: UserRole) => {
    updatePerm.mutate({ userId, role });
  };

  const saveMemo = (userId: number) => {
    updatePerm.mutate({ userId, memo: memoEdit[userId] ?? "" });
  };

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <Loader2 size={24} color="#6366f1" className="animate-spin" />
    </div>
  );

  // 필터 탭 정의
  const filterTabs = [
    { key: "all" as const, label: "전체", count: userList?.length ?? 0 },
    { key: "admin" as const, label: "관리자", count: userList?.filter((u: any) => !u.isBanned && u.role === "admin").length ?? 0 },
    { key: "sub_admin" as const, label: "부관리자", count: userList?.filter((u: any) => !u.isBanned && u.role === "sub_admin").length ?? 0 },
    { key: "user" as const, label: "일반 회원", count: userList?.filter((u: any) => !u.isBanned && u.role === "user").length ?? 0 },
    { key: "banned" as const, label: "차단됨", count: userList?.filter((u: any) => u.isBanned).length ?? 0 },
  ];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Users size={18} color="#6366f1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>회원 관리</span>
          <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 4 }}>총 {userList?.length ?? 0}명</span>
        </div>

        {/* 검색 + 필터 */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={13} color="#9ca3af" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름 또는 이메일 검색..."
              style={{ ...inputStyle, width: "100%", padding: "8px 10px 8px 30px", boxSizing: "border-box" }}
            />
          </div>
          {filterTabs.map(tab => {
            const isBannedTab = tab.key === "banned";
            const isActive = filterRole === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterRole(tab.key)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  border: isActive ? `2px solid ${isBannedTab ? "#ef4444" : "#6366f1"}` : "1px solid #e5e7eb",
                  background: isActive ? (isBannedTab ? "#fee2e2" : "#eef2ff") : "#fff",
                  color: isActive ? (isBannedTab ? "#dc2626" : "#6366f1") : "#6b7280",
                  fontWeight: isActive ? 700 : 400,
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: isActive ? (isBannedTab ? "#dc2626" : "#6366f1") : "#e5e7eb",
                  color: isActive ? "#fff" : "#6b7280",
                  borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center",
                }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 권한 설명 */}
      <div style={{ ...cardStyle, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "#166534", lineHeight: 1.7 }}>
          <strong>권한 안내</strong><br />
          · <strong>관리자(최고)</strong>: 사이트 소유자, 모든 권한 보유 (역할 변경 불가)<br />
          · <strong>관리자</strong>: 관리자 페이지 전체 접근 가능, 글쓰기/다운로드 자동 허용<br />
          · <strong>부관리자</strong>: 지정된 카테고리에 글쓰기 가능, 관리자 페이지 접근 불가<br />
          · <strong>글쓰기 권한</strong>: 활성화 시 해당 회원이 글쓰기 버튼을 사용할 수 있습니다<br />
          · <strong>차단</strong>: 차단된 회원은 로그인 후에도 서비스 이용이 제한됩니다
        </div>
      </div>

      {/* 회원 목록 */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", fontSize: 13 }}>
          검색 결과가 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((u: any) => {
            const isExpanded = expandedId === u.id;
            const isOwner = !!u.isOwner;
            const role: UserRole = u.role as UserRole;
            const isAdmin = role === "admin" || isOwner;
            const isSubAdmin = role === "sub_admin";

            return (
              <div key={u.id} style={{ ...cardStyle, marginBottom: 0, opacity: u.isBanned ? 0.6 : 1 }}>
                {/* 요약 행 */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  onClick={() => {
                    setExpandedId(isExpanded ? null : u.id);
                    if (!isExpanded && memoEdit[u.id] === undefined) {
                      setMemoEdit(prev => ({ ...prev, [u.id]: u.memo ?? "" }));
                    }
                  }}
                >
                  {/* 아바타 */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    background: isOwner
                      ? "linear-gradient(135deg,#7c3aed,#a855f7)"
                      : isAdmin
                      ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                      : isSubAdmin
                      ? "linear-gradient(135deg,#0891b2,#06b6d4)"
                      : "#e5e7eb",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700,
                    color: (isOwner || isAdmin || isSubAdmin) ? "#fff" : "#6b7280",
                  }}>
                    {isOwner ? <Crown size={16} /> : (u.name ?? "?")[0].toUpperCase()}
                  </div>

                  {/* 이름/이메일 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{u.name ?? "(이름 없음)"}</span>
                      {u.username && (
                        <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 500 }}>@{u.username}</span>
                      )}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                        background: getRoleBg(role, isOwner), color: getRoleColor(role, isOwner),
                      }}>{getRoleLabel(role, isOwner)}</span>
                      {u.isFeaturedDeveloper && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#fef3c7", color: "#d97706", display: "flex", alignItems: "center", gap: 2 }}>
                          <Star size={8} fill="#d97706" />주목 개발자
                        </span>
                      )}
                      {u.isBanned && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10, background: "#fee2e2", color: "#dc2626" }}>차단됨</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{u.email ?? u.openId}</div>
                  </div>

                  {/* 권한 배지 (요약) */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (isAdmin || u.canWrite || isSubAdmin) ? "#dcfce7" : "#f3f4f6", color: (isAdmin || u.canWrite || isSubAdmin) ? "#16a34a" : "#9ca3af" }}>
                      글쓰기 {(isAdmin || u.canWrite || isSubAdmin) ? "✓" : "✗"}
                    </span>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (isAdmin || u.canDownload) ? "#dcfce7" : "#fee2e2", color: (isAdmin || u.canDownload) ? "#16a34a" : "#dc2626" }}>
                      다운로드 {(isAdmin || u.canDownload) ? "✓" : "✗"}
                    </span>
                  </div>

                  {/* 가입일 */}
                  <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, minWidth: 70, textAlign: "right" }}>
                    {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                  </div>

                  <ChevronDown size={14} color="#9ca3af" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }} />
                </div>

                {/* 상세 패널 */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      {/* 회원 정보 */}
                      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" as const }}>회원 정보</div>
                        <div style={{ fontSize: 12, color: "#374151", lineHeight: 2 }}>
                          <div>ID: <strong>{u.id}</strong></div>
                          <div>이름: <strong>{u.name ?? "-"}</strong></div>
                          <div>닉네임: <strong>{u.username ? `@${u.username}` : "(미설정)"}</strong></div>
                          <div>이메일: <strong>{u.email ?? "-"}</strong></div>
                          <div>가입일: <strong>{new Date(u.createdAt).toLocaleString("ko-KR")}</strong></div>
                          <div>최근 로그인: <strong>{new Date(u.lastSignedIn).toLocaleString("ko-KR")}</strong></div>
                          <div>약관 동의: <strong>{u.agreedToTerms ? "동의" : "미동의"}</strong></div>
                        </div>
                      </div>

                      {/* 권한 설정 */}
                      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" as const }}>권한 설정</div>

                        {/* 역할 */}
                        {isOwner ? (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>역할 (Role)</div>
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "8px 12px", borderRadius: 6,
                              background: "#f5f3ff", border: "1px solid #c4b5fd",
                              fontSize: 12, color: "#7c3aed", fontWeight: 700,
                            }}>
                              <Crown size={13} />
                              관리자(최고) — 역할 변경 불가
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>역할 (Role)</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => setRole(u.id, "user")}
                                disabled={updatePerm.isPending}
                                style={{
                                  flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                  border: role === "user" ? "2px solid #6366f1" : "1px solid #e5e7eb",
                                  background: role === "user" ? "#eef2ff" : "#fff",
                                  color: role === "user" ? "#6366f1" : "#6b7280",
                                  fontWeight: role === "user" ? 700 : 400,
                                }}
                              >일반</button>
                              <button
                                onClick={() => setRole(u.id, "sub_admin")}
                                disabled={updatePerm.isPending}
                                style={{
                                  flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                  border: role === "sub_admin" ? "2px solid #0891b2" : "1px solid #e5e7eb",
                                  background: role === "sub_admin" ? "#ecfeff" : "#fff",
                                  color: role === "sub_admin" ? "#0891b2" : "#6b7280",
                                  fontWeight: role === "sub_admin" ? 700 : 400,
                                }}
                              >
                                <Shield size={10} style={{ display: "inline", marginRight: 3 }} />부관리자
                              </button>
                              <button
                                onClick={() => setRole(u.id, "admin")}
                                disabled={updatePerm.isPending}
                                style={{
                                  flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                  border: role === "admin" ? "2px solid #6366f1" : "1px solid #e5e7eb",
                                  background: role === "admin" ? "#eef2ff" : "#fff",
                                  color: role === "admin" ? "#6366f1" : "#6b7280",
                                  fontWeight: role === "admin" ? 700 : 400,
                                }}
                              >
                                <ShieldOff size={10} style={{ display: "inline", marginRight: 3 }} />관리자
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 글쓰기 권한 */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>글쓰기 권한</div>
                            <div style={{ fontSize: 10, color: "#9ca3af" }}>관리자/부관리자는 자동 허용</div>
                          </div>
                          <button
                            onClick={() => toggle(u.id, "canWrite", u.canWrite)}
                            disabled={isAdmin || isSubAdmin || updatePerm.isPending}
                            style={{
                              width: 40, height: 22, borderRadius: 11, border: "none",
                              cursor: (isAdmin || isSubAdmin) ? "not-allowed" : "pointer",
                              background: (isAdmin || isSubAdmin || u.canWrite) ? "#6366f1" : "#d1d5db",
                              position: "relative", transition: "background 0.2s",
                              opacity: (isAdmin || isSubAdmin) ? 0.5 : 1,
                            }}
                          >
                            <span style={{ position: "absolute", top: 2, left: (isAdmin || isSubAdmin || u.canWrite) ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                          </button>
                        </div>

                        {/* 다운로드 권한 */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>다운로드 권한</div>
                            <div style={{ fontSize: 10, color: "#9ca3af" }}>자료실 파일 다운로드</div>
                          </div>
                          <button
                            onClick={() => toggle(u.id, "canDownload", u.canDownload)}
                            disabled={isAdmin || updatePerm.isPending}
                            style={{
                              width: 40, height: 22, borderRadius: 11, border: "none",
                              cursor: isAdmin ? "not-allowed" : "pointer",
                              background: (isAdmin || u.canDownload) ? "#6366f1" : "#d1d5db",
                              position: "relative", transition: "background 0.2s",
                              opacity: isAdmin ? 0.5 : 1,
                            }}
                          >
                            <span style={{ position: "absolute", top: 2, left: (isAdmin || u.canDownload) ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                          </button>
                        </div>

                        {/* 차단 */}
                        {!isOwner && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>회원 차단</div>
                              <div style={{ fontSize: 10, color: "#9ca3af" }}>차단 시 서비스 이용 제한</div>
                            </div>
                            <button
                              onClick={() => toggle(u.id, "isBanned", u.isBanned)}
                              disabled={updatePerm.isPending}
                              style={{
                                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                                background: u.isBanned ? "#ef4444" : "#d1d5db",
                                position: "relative", transition: "background 0.2s",
                              }}
                            >
                              <span style={{ position: "absolute", top: 2, left: u.isBanned ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 카테고리별 글쓰기 권한 */}
                    {(isSubAdmin || u.canWrite) && !isAdmin && (
                      <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase" as const }}>
                          카테고리별 글쓰기 권한
                        </div>
                        <CategoryPermissionsPanel
                          userId={u.id}
                          canWrite={u.canWrite || isSubAdmin}
                          isAdmin={isAdmin}
                        />
                      </div>
                    )}

                    {/* 주목 개발자 설정 */}
                    <div style={{ background: "#fffbeb", borderRadius: 8, padding: "12px 14px", marginBottom: 14, border: "1px solid #fde68a" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 10, textTransform: "uppercase" as const, display: "flex", alignItems: "center", gap: 6 }}>
                        <Star size={11} fill="#d97706" color="#d97706" />주목 개발자 설정
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>주목 개발자로 지정</div>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>홈 화면 주목 개발자 섹션에 표시됩니다</div>
                        </div>
                        <button
                          onClick={() => updatePerm.mutate({ userId: u.id, isFeaturedDeveloper: !u.isFeaturedDeveloper })}
                          disabled={updatePerm.isPending}
                          style={{
                            width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                            background: u.isFeaturedDeveloper ? "#f59e0b" : "#d1d5db",
                            position: "relative", transition: "background 0.2s",
                          }}
                        >
                          <span style={{ position: "absolute", top: 2, left: u.isFeaturedDeveloper ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                        </button>
                      </div>
                      {u.isFeaturedDeveloper && (
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <label style={{ fontSize: 11, color: "#6b7280", minWidth: 60 }}>표시 순서</label>
                            <input
                              type="number"
                              min={1}
                              defaultValue={u.featuredOrder ?? 0}
                              onBlur={e => updatePerm.mutate({ userId: u.id, featuredOrder: parseInt(e.target.value) || 0 })}
                              style={{ ...inputStyle, width: 70, padding: "4px 8px" }}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <label style={{ fontSize: 11, color: "#6b7280", minWidth: 60, paddingTop: 6 }}>자기소개</label>
                            <div style={{ flex: 1, display: "flex", gap: 6 }}>
                              <textarea
                                defaultValue={u.bio ?? ""}
                                onBlur={e => updatePerm.mutate({ userId: u.id, bio: e.target.value || null })}
                                placeholder="주목 개발자 섹션에 표시될 자기소개를 입력하세요..."
                                rows={2}
                                style={{ ...inputStyle, flex: 1, padding: "6px 8px", resize: "vertical" as const }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 관리자 메모 */}
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 6 }}>관리자 메모 (내부용, 회원에게 표시되지 않음)</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={memoEdit[u.id] ?? u.memo ?? ""}
                          onChange={e => setMemoEdit(prev => ({ ...prev, [u.id]: e.target.value }))}
                          placeholder="이 회원에 대한 메모를 입력하세요..."
                          style={{ ...inputStyle, flex: 1, padding: "8px 10px" }}
                        />
                        <button
                          onClick={() => saveMemo(u.id)}
                          disabled={updatePerm.isPending}
                          style={{ padding: "8px 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        >
                          <Save size={12} />저장
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
