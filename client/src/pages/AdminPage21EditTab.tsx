/**
 * 관리자 전용 - page21 (바이브코딩으로 만든 앱 알리기) 편집 탭
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Settings2, RefreshCw, Save, Eye, ExternalLink, Users, Package,
  ChevronDown, ChevronUp, Edit3, Globe, ArrowUpRight,
  Layout, Type,
} from "lucide-react";

const PAGE21_ID = 270001;

function SectionCard({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", background: "none", border: "none", cursor: "pointer", borderBottom: open ? "1px solid #F3F4F6" : "none" }}
      >
        <span style={{ color: "#5B5BF6" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", flex: 1, textAlign: "left" }}>{title}</span>
        {open ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />}
      </button>
      {open && <div style={{ padding: "18px 20px" }}>{children}</div>}
    </div>
  );
}

function FieldRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{label}</label>
        {desc && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{desc}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── 주목 개발자 섹션 설정 ────────────────────────────────────
function FeaturedDevSettings() {
  const { data: devs } = trpc.developers.getFeatured.useQuery();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#F8F9FF", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>현재 주목 개발자 목록</div>
        {devs && devs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {devs.map((dev: any, i: number) => (
              <div key={dev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "white", borderRadius: 9, border: "1px solid #EAECF2" }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: i < 3 ? "#5B5BF6" : "#9CA3AF", width: 24, textAlign: "center" }}>{i + 1}</span>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #5B5BF6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 14 }}>
                  {dev.username?.charAt(0) ?? "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#1A1A2E" }}>{dev.username}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{dev.bio || "소개 없음"}</div>
                </div>
                <Badge variant="outline" style={{ fontSize: 10 }}>개발자</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>주목 개발자가 없습니다. 회원 관리에서 isFeaturedDeveloper를 활성화하세요.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <a href="/admin?tab=users" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#F8F9FF", border: "1.5px solid #EAECF2", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#5B5BF6", textDecoration: "none" }}>
          <Users size={13} /> 회원 관리에서 개발자 설정
        </a>
      </div>
    </div>
  );
}

// ─── 앱 카드 섹션 설정 ────────────────────────────────────────
function AppCardSettings() {
  const { data: apps } = trpc.apps.list.useQuery();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#F8F9FF", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>
          현재 승인된 앱 ({apps?.filter((a: any) => a.approved).length ?? 0}개)
        </div>
        {apps && apps.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
            {apps.filter((a: any) => a.approved).slice(0, 8).map((app: any) => (
              <div key={app.id} style={{ padding: "10px 12px", background: "white", borderRadius: 9, border: "1px solid #EAECF2", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{app.iconEmoji || "📦"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.name}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{app.authorUsername}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#9CA3AF", fontSize: 13 }}>승인된 앱이 없습니다.</div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <a href="/admin?tab=apps" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", background: "#F8F9FF", border: "1.5px solid #EAECF2", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#5B5BF6", textDecoration: "none" }}>
          <Package size={13} /> 앱 관리에서 승인/거절
        </a>
      </div>
    </div>
  );
}

// ─── 페이지 헤더 문구 편집 ────────────────────────────────────
function PageHeaderEditor({ pageId }: { pageId: number }) {
  const { data: pageData, refetch } = trpc.pages.adminGet.useQuery({ id: pageId });
  const updateMutation = trpc.pages.update.useMutation({
    onSuccess: () => { toast.success("페이지 정보가 저장되었습니다."); refetch(); },
    onError: (e: any) => toast.error("저장 실패: " + e.message),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (pageData) {
      setTitle((pageData as any).title ?? "");
      setDescription((pageData as any).description ?? "");
    }
  }, [pageData]);

  const handleSave = () => {
    updateMutation.mutate({ id: pageId, title, description });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <FieldRow label="페이지 제목" desc="브라우저 탭 및 관리자 목록에 표시">
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="바이브코딩으로 만든 앱 알리기" style={{ fontSize: 13 }} />
      </FieldRow>
      <FieldRow label="페이지 설명 (SEO 설명)" desc="구글 검색 결과 설명 (160자 이내 권장)">
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="바이브코딩으로 만든 AI 앱을 공유하고 발견하세요." rows={3} style={{ fontSize: 13 }} />
        <div style={{ fontSize: 11, color: description.length > 160 ? "#DC2626" : "#9CA3AF", textAlign: "right" }}>{description.length}/160자</div>
      </FieldRow>
      <Button onClick={handleSave} disabled={updateMutation.isPending} style={{ alignSelf: "flex-start", background: "#5B5BF6", color: "white", fontSize: 13, borderRadius: 9 }}>
        {updateMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}&nbsp;저장
      </Button>
    </div>
  );
}

// ─── HTML 섹션 직접 편집 ──────────────────────────────────────
function HtmlSectionEditor({ pageId }: { pageId: number }) {
  const { data: pageData, refetch } = trpc.pages.adminGet.useQuery({ id: pageId });
  const updateMutation = trpc.pages.update.useMutation({
    onSuccess: () => { toast.success("HTML 섹션이 저장되었습니다."); refetch(); },
    onError: (e: any) => toast.error("저장 실패: " + e.message),
  });

  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number | null>(null);
  const [htmlContent, setHtmlContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // sectionsJson 파싱
  const sections: any[] = (() => {
    try {
      return JSON.parse((pageData as any)?.sectionsJson ?? "[]");
    } catch { return []; }
  })();
  const htmlSections = sections.filter((s: any) => s.type === "html" || s.settings?.isAppMode);

  const handleSelectSection = (section: any, idx: number) => {
    setSelectedSectionIdx(idx);
    setHtmlContent(section.content ?? "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (selectedSectionIdx === null) return;
    // 해당 섹션의 content를 업데이트한 새 sectionsJson 생성
    const updatedSections = sections.map((s: any, i: number) => {
      if (s === htmlSections[selectedSectionIdx]) return { ...s, content: htmlContent };
      return s;
    });
    updateMutation.mutate({ id: pageId, sectionsJson: JSON.stringify(updatedSections) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "12px 16px", border: "1px solid #FDE68A", fontSize: 13, color: "#92400E" }}>
        ⚠️ HTML 섹션을 직접 편집합니다. 잘못된 HTML은 페이지 표시 오류를 유발할 수 있습니다. 편집 전 백업을 권장합니다.
      </div>

      {htmlSections.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 13, padding: 16 }}>HTML 섹션이 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 4 }}>HTML 섹션 목록</div>
          {htmlSections.map((section: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: selectedSectionIdx === i ? "#EEF2FF" : "#F8F9FF", borderRadius: 9, border: `1.5px solid ${selectedSectionIdx === i ? "#5B5BF6" : "#EAECF2"}`, cursor: "pointer" }} onClick={() => handleSelectSection(section, i)}>
              <Layout size={14} color="#5B5BF6" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1A1A2E" }}>섹션 #{section.id ?? i + 1}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{(section.content ?? "").length.toLocaleString()}자 · {section.settings?.isAppMode ? "앱 모드" : "HTML"}</div>
              </div>
              <Edit3 size={13} color="#5B5BF6" />
            </div>
          ))}
        </div>
      )}

      {isEditing && selectedSectionIdx !== null && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>섹션 #{htmlSections[selectedSectionIdx]?.id ?? selectedSectionIdx + 1} 편집</span>
            <Badge variant="outline" style={{ fontSize: 10 }}>{htmlContent.length.toLocaleString()}자</Badge>
          </div>
          <Textarea
            value={htmlContent}
            onChange={e => setHtmlContent(e.target.value)}
            rows={20}
            style={{ fontSize: 12, fontFamily: "monospace", background: "#1E1E2E", color: "#CDD6F4", borderRadius: 9, border: "1.5px solid #EAECF2" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={handleSave} disabled={updateMutation.isPending} style={{ background: "#5B5BF6", color: "white", fontSize: 13, borderRadius: 9 }}>
              {updateMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}&nbsp;저장
            </Button>
            <Button variant="outline" onClick={() => setIsEditing(false)} style={{ fontSize: 13, borderRadius: 9 }}>취소</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export function AdminPage21EditTab() {
  const { data: pageData } = trpc.pages.adminGet.useQuery({ id: PAGE21_ID });
  const [activeSection, setActiveSection] = useState<"overview" | "header" | "devs" | "apps" | "html">("overview");

  const navItems = [
    { key: "overview" as const, label: "개요", icon: <Globe size={14} /> },
    { key: "header" as const, label: "페이지 헤더/설명", icon: <Type size={14} /> },
    { key: "devs" as const, label: "주목 개발자 섹션", icon: <Users size={14} /> },
    { key: "apps" as const, label: "앱 카드 섹션", icon: <Package size={14} /> },
    { key: "html" as const, label: "HTML 직접 편집", icon: <Edit3 size={14} /> },
  ];

  const sections: any[] = (() => {
    try { return JSON.parse((pageData as any)?.sectionsJson ?? "[]"); } catch { return []; }
  })();

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", color: "#1A1A2E" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E", margin: 0 }}>page21 편집</h2>
            <Badge style={{ background: "#5B5BF6", color: "white", fontSize: 10 }}>바이브코딩 앱 알리기</Badge>
          </div>
          <p style={{ fontSize: 13, color: "#6B6B8A", margin: 0 }}>page21의 모든 구성 요소를 편집합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/page/page21" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "white", border: "1.5px solid #EAECF2", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#6B6B8A", textDecoration: "none" }}>
            <Eye size={13} /> 페이지 보기 <ArrowUpRight size={12} />
          </a>
          <a href="/page/page21?preview=true" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#5B5BF6", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "white", textDecoration: "none" }}>
            <Settings2 size={13} /> 관리자 미리보기
          </a>
        </div>
      </div>

      {/* 섹션 네비게이션 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {navItems.map(item => (
          <button key={item.key} onClick={() => setActiveSection(item.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 22, fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: activeSection === item.key ? "#5B5BF6" : "white",
            color: activeSection === item.key ? "white" : "#6B6B8A",
            border: `1.5px solid ${activeSection === item.key ? "#5B5BF6" : "#EAECF2"}`,
            transition: "all .15s",
          }}>
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {/* 개요 */}
      {activeSection === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              { label: "페이지 ID", value: String(PAGE21_ID), icon: <Globe size={16} color="#5B5BF6" /> },
              { label: "슬러그", value: "page21", icon: <ExternalLink size={16} color="#5B5BF6" /> },
              { label: "발행 상태", value: (pageData as any)?.published ? "발행됨" : "비공개", icon: <Eye size={16} color={(pageData as any)?.published ? "#16A34A" : "#DC2626"} /> },
              { label: "섹션 수", value: `${sections.length}개`, icon: <Layout size={16} color="#5B5BF6" /> },
            ].map(item => (
              <div key={item.label} style={{ background: "white", borderRadius: 14, padding: "16px 18px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12, color: "#6B6B8A", fontWeight: 500 }}>
                  {item.icon} {item.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "linear-gradient(135deg, #5B5BF6 0%, #8B5CF6 100%)", borderRadius: 14, padding: "20px 22px", color: "white" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>빠른 편집</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { label: "페이지 헤더/설명 편집", section: "header" as const },
                { label: "주목 개발자 설정", section: "devs" as const },
                { label: "앱 카드 설정", section: "apps" as const },
                { label: "HTML 직접 편집", section: "html" as const },
              ].map(action => (
                <button key={action.label} onClick={() => setActiveSection(action.section)} style={{ background: "rgba(255,255,255,.2)", border: "1.5px solid rgba(255,255,255,.3)", borderRadius: 9, padding: "8px 16px", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: "#F0FDF4", borderRadius: 14, padding: "16px 20px", border: "1.5px solid #BBF7D0" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#166534", marginBottom: 8 }}>page21 구성 안내</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#166534" }}>
              <div>• <strong>주목 개발자 섹션</strong>: DB에서 isFeaturedDeveloper=true인 회원을 자동으로 불러와 표시</div>
              <div>• <strong>앱 카드 섹션</strong>: DB에서 approved 상태인 앱을 자동으로 불러와 그리드로 표시</div>
              <div>• <strong>HTML 섹션</strong>: 앱 쇼룸 전체 UI (개발자 순위, 앱 목록, 설정 패널 등)</div>
              <div>• <strong>설정 버튼(⚙️)</strong>: HTML 섹션 내 SP 패널 — 관리자 로그인 시에만 표시됨</div>
            </div>
          </div>
        </div>
      )}

      {activeSection === "header" && (
        <SectionCard title="페이지 헤더 및 설명 설정" icon={<Type size={16} />}>
          <PageHeaderEditor pageId={PAGE21_ID} />
        </SectionCard>
      )}

      {activeSection === "devs" && (
        <SectionCard title="주목 개발자 섹션 설정" icon={<Users size={16} />}>
          <FeaturedDevSettings />
        </SectionCard>
      )}

      {activeSection === "apps" && (
        <SectionCard title="앱 카드 섹션 설정" icon={<Package size={16} />}>
          <AppCardSettings />
        </SectionCard>
      )}

      {activeSection === "html" && (
        <SectionCard title="HTML 섹션 직접 편집" icon={<Edit3 size={16} />}>
          <HtmlSectionEditor pageId={PAGE21_ID} />
        </SectionCard>
      )}
    </div>
  );
}

export default AdminPage21EditTab;
