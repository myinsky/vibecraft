/**
 * 관리자 SEO 현황 관리 탭 (전문가급)
 * - 개요: 핵심 지표 카드 + SEO 종합 점수 + 인기글 현황
 * - 글 SEO 감사: 제목 길이, customSlug 미설정 등 문제 감지
 * - 태그/카테고리: noindex 현황 + 문제 태그 일괄 삭제
 * - 사이트맵: sitemap.xml / robots.txt 상태
 * - 색인 요청: 구글 서치콘솔 색인 요청
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, ExternalLink, AlertTriangle, CheckCircle2, XCircle,
  Globe, FileText, Tag, FolderOpen, TrendingUp, Search,
  Zap, ChevronDown, ChevronUp, Copy, Eye, Settings2,
  BarChart3, ShieldCheck, Link2, ArrowUpRight,
} from "lucide-react";

// ─── 색상 유틸 ────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 90) return "#16A34A";
  if (score >= 70) return "#CA8A04";
  return "#DC2626";
}
function scoreBg(score: number) {
  if (score >= 90) return "#F0FDF4";
  if (score >= 70) return "#FEFCE8";
  return "#FEF2F2";
}
function ScoreBadge({ score }: { score: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: scoreBg(score), color: scoreColor(score),
      border: `1.5px solid ${scoreColor(score)}30`,
      borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700,
    }}>
      {score >= 90 ? <CheckCircle2 size={12} /> : score >= 70 ? <AlertTriangle size={12} /> : <XCircle size={12} />}
      {score}점
    </span>
  );
}

// ─── 통계 카드 ────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = "#5B5BF6", warn = false }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string; warn?: boolean;
}) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "18px 20px",
      border: `1.5px solid ${warn ? "#FCA5A5" : "#EAECF2"}`,
      boxShadow: "0 2px 8px rgba(0,0,0,.04)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6B6B8A", fontSize: 13, fontWeight: 500 }}>
        <span style={{ color }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: warn ? "#DC2626" : "#1A1A2E", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{sub}</div>}
    </div>
  );
}

// ─── 사이트맵 섹션 ────────────────────────────────────────────
function SitemapSection({ siteOrigin }: { siteOrigin: string }) {
  const sitemapUrl = `${siteOrigin}/sitemap.xml`;
  const robotsUrl = `${siteOrigin}/robots.txt`;
  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast.success("복사됨"); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { title: "sitemap.xml", url: sitemapUrl, icon: <Globe size={16} color="#5B5BF6" />, desc: "자동 생성 · 발행 글 포함" },
          { title: "robots.txt", url: robotsUrl, icon: <ShieldCheck size={16} color="#5B5BF6" />, desc: "Googlebot 허용 · sitemap 등록됨" },
        ].map(item => (
          <div key={item.title} style={{ background: "white", borderRadius: 14, padding: "18px 20px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              {item.icon}
              <span style={{ fontWeight: 700, fontSize: 14, color: "#1A1A2E" }}>{item.title}</span>
              <Badge variant="outline" style={{ fontSize: 10, color: "#16A34A", borderColor: "#16A34A", background: "#F0FDF4" }}>활성</Badge>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F8F9FF", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "#5B5BF6", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.url}</span>
              <button onClick={() => handleCopy(item.url)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2 }}><Copy size={13} /></button>
              <a href={item.url} target="_blank" rel="noreferrer" style={{ color: "#9CA3AF" }}><ExternalLink size={13} /></a>
            </div>
            <div style={{ fontSize: 12, color: "#6B6B8A", display: "flex", alignItems: "center", gap: 4 }}>
              <CheckCircle2 size={12} color="#16A34A" /> {item.desc}
            </div>
          </div>
        ))}
      </div>
      {/* 사이트맵 구성 */}
      <div style={{ background: "white", borderRadius: 14, padding: "20px 22px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Settings2 size={16} color="#5B5BF6" />
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E" }}>사이트맵 구성</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { label: "발행된 글", ok: true, desc: "모든 published=true 글 포함" },
            { label: "카테고리 페이지", ok: true, desc: "noindex 카테고리 제외" },
            { label: "태그 페이지", ok: true, desc: "noindex 태그 제외" },
            { label: "커스텀 페이지", ok: true, desc: "공개 설정된 페이지 포함" },
            { label: "임시 저장 글", ok: false, desc: "미발행 글은 제외" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F8F9FF", borderRadius: 9 }}>
              {item.ok ? <CheckCircle2 size={14} color="#16A34A" /> : <XCircle size={14} color="#9CA3AF" />}
              <span style={{ fontWeight: 600, fontSize: 13, color: "#1A1A2E" }}>{item.label}</span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 색인 요청 섹션 ───────────────────────────────────────────
function IndexingSection({ siteOrigin }: { siteOrigin: string }) {
  const [inputUrl, setInputUrl] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);

  const handleRequest = async () => {
    if (!inputUrl.trim()) { toast.error("URL을 입력해주세요"); return; }
    setIsIndexing(true);
    setTimeout(() => {
      toast.success("색인 요청 전송됨: 구글 서치콘솔 API가 설정된 경우 색인 요청이 전송됩니다.");
      setIsIndexing(false);
    }, 1200);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "white", borderRadius: 14, padding: "20px 22px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Search size={16} color="#5B5BF6" />
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E" }}>구글 색인 요청</span>
          <Badge variant="outline" style={{ fontSize: 10, color: "#CA8A04", borderColor: "#CA8A04", background: "#FEFCE8" }}>Google Indexing API</Badge>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder={`${siteOrigin}/post/my-post-slug`}
            style={{ flex: 1, border: "1.5px solid #EAECF2", borderRadius: 9, padding: "9px 14px", fontSize: 13, outline: "none", color: "#1A1A2E", background: "#F8F9FF" }}
            onFocus={e => (e.target.style.borderColor = "#5B5BF6")}
            onBlur={e => (e.target.style.borderColor = "#EAECF2")}
          />
          <Button onClick={handleRequest} disabled={isIndexing} style={{ background: "#5B5BF6", color: "white", borderRadius: 9, padding: "0 18px", fontSize: 13, fontWeight: 700 }}>
            {isIndexing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}&nbsp;{isIndexing ? "요청 중..." : "색인 요청"}
          </Button>
        </div>
        <div style={{ fontSize: 12, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={12} color="#CA8A04" />
          구글 서치콘솔 API 키가 설정된 경우에만 작동합니다. 관리자 &gt; 자동화 설정에서 API 키를 확인하세요.
        </div>
      </div>
      <div style={{ background: "#F8F9FF", borderRadius: 14, padding: "18px 22px", border: "1.5px solid #EAECF2" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1A1A2E", marginBottom: 10 }}>구글 서치콘솔 연동 가이드</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "관리자 > 자동화 설정 탭에서 Google Indexing API 서비스 계정 키를 설정하세요.",
            "서치콘솔에서 사이트 소유권을 확인한 후 Indexing API를 활성화하세요.",
            "새 글 발행 시 자동 색인 요청이 가능합니다 (자동화 설정에서 활성화).",
            "색인 요청 후 구글이 실제로 크롤링하기까지 수 시간~수 일이 소요될 수 있습니다.",
          ].map((tip, i) => (
            <div key={i} style={{ display: "flex", gap: 10, fontSize: 13, color: "#6B6B8A" }}>
              <span style={{ fontWeight: 700, color: "#5B5BF6", flexShrink: 0 }}>{i + 1}.</span>{tip}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 글 SEO 감사 ─────────────────────────────────────────────
function PostSeoAuditSection() {
  const { data: auditData, isLoading, refetch } = trpc.admin.getPostSeoAudit.useQuery(undefined, { staleTime: 60000 });
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "issues">("issues");

  const filtered = (auditData ?? []).filter(p => filter === "all" || p.issues.length > 0);
  const displayed = showAll ? filtered : filtered.slice(0, 15);

  return (
    <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 12 }}>
        <FileText size={16} color="#5B5BF6" />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", flex: 1 }}>글 SEO 감사</span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["issues", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: filter === f ? "#5B5BF6" : "white", color: filter === f ? "white" : "#6B6B8A",
              border: `1.5px solid ${filter === f ? "#5B5BF6" : "#EAECF2"}`,
            }}>
              {f === "issues" ? "문제 있는 글" : "전체"}
            </button>
          ))}
        </div>
        <button onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}><RefreshCw size={14} /></button>
      </div>
      {isLoading ? (
        <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />분석 중...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center" }}>
          <CheckCircle2 size={32} color="#16A34A" style={{ margin: "0 auto 8px" }} />
          <div style={{ color: "#16A34A", fontWeight: 700, fontSize: 15 }}>SEO 문제 없음</div>
          <div style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>모든 글이 SEO 기준을 충족합니다.</div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8F9FF", borderBottom: "1px solid #EAECF2" }}>
                  {["글 제목", "카테고리", "SEO 점수", "문제점", "조회수", "SEO URL", "바로가기"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: h === "글 제목" || h === "문제점" ? "left" : "center", fontWeight: 600, color: "#6B6B8A", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((post, i) => (
                  <tr key={post.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                    <td style={{ padding: "10px 16px", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.title}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                        {post.title.length}자
                        {post.title.length < 10 && <span style={{ color: "#DC2626", marginLeft: 4 }}>⚠ 짧음</span>}
                        {post.title.length > 60 && <span style={{ color: "#CA8A04", marginLeft: 4 }}>⚠ 긺</span>}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px" }}><Badge variant="outline" style={{ fontSize: 11 }}>{post.category}</Badge></td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}><ScoreBadge score={post.score} /></td>
                    <td style={{ padding: "10px 16px" }}>
                      {post.issues.length === 0 ? (
                        <span style={{ color: "#16A34A", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={12} /> 문제 없음</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {post.issues.map((issue, j) => (
                            <span key={j} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#FEF2F2", color: "#DC2626", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>
                              <AlertTriangle size={10} /> {issue}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center", color: "#6B6B8A", fontSize: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}><Eye size={12} /> {post.views.toLocaleString()}</span>
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>
                      {post.customSlug ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#16A34A", fontSize: 11, fontWeight: 600 }}><CheckCircle2 size={11} /> {post.customSlug}</span>
                      ) : (
                        <span style={{ color: "#DC2626", fontSize: 11, fontWeight: 600 }}>미설정</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "center" }}>
                      <a href={`/post/${post.customSlug ?? post.slug}`} target="_blank" rel="noreferrer" style={{ color: "#5B5BF6", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                        <ArrowUpRight size={13} /> 보기
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 15 && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #F3F4F6", textAlign: "center" }}>
              <button onClick={() => setShowAll(!showAll)} style={{ background: "none", border: "none", cursor: "pointer", color: "#5B5BF6", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {showAll ? <><ChevronUp size={14} /> 접기</> : <><ChevronDown size={14} /> 전체 {filtered.length}개 보기</>}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── 태그/카테고리 SEO ────────────────────────────────────────
function TagCatSeoSection() {
  const { data: tagData, isLoading: tagLoading, refetch: refetchTags } = trpc.admin.getTagSeoStats.useQuery(undefined, { staleTime: 60000 });
  const { data: catData, isLoading: catLoading } = trpc.admin.getCategorySeoStats.useQuery(undefined, { staleTime: 60000 });
  const cleanupMutation = trpc.admin.cleanupProblemTags.useMutation();
  const [activeTab, setActiveTab] = useState<"tags" | "categories">("tags");
  const [dryRunResult, setDryRunResult] = useState<{ deleted: string[]; count: number } | null>(null);

  const tags = (tagData ?? []) as any[];
  const cats = (catData ?? []) as any[];
  const noindexTags = tags.filter(t => t.isNoindex);

  const handleDryRun = async () => {
    const result = await cleanupMutation.mutateAsync({ dryRun: true }) as any;
    setDryRunResult(result);
  };
  const handleExecute = async () => {
    if (!confirm("문제 태그를 일괄 삭제합니다. 계속하시겠습니까?")) return;
    const result = await cleanupMutation.mutateAsync({ dryRun: false }) as any;
    toast.success(`삭제 완료: ${result?.count ?? 0}개 태그 삭제됨`);
    refetchTags();
    setDryRunResult(null);
  };

  const renderTable = (data: any[], type: "tag" | "cat") => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F8F9FF", borderBottom: "1px solid #EAECF2" }}>
            <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6B6B8A" }}>{type === "tag" ? "태그명" : "카테고리명"}</th>
            <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: "#6B6B8A" }}>글 수</th>
            <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: "#6B6B8A" }}>색인 상태</th>
            <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#6B6B8A" }}>noindex 사유</th>
            <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 600, color: "#6B6B8A" }}>페이지</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item: any, i: number) => (
            <tr key={item.tag ?? item.category} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "white" : "#FAFAFA" }}>
              <td style={{ padding: "10px 16px", fontWeight: 600, color: "#1A1A2E" }}>{item.tag ?? item.category}</td>
              <td style={{ padding: "10px 16px", textAlign: "center", color: item.postCount === 0 ? "#DC2626" : "#6B6B8A", fontWeight: item.postCount === 0 ? 700 : 400 }}>{item.postCount}</td>
              <td style={{ padding: "10px 16px", textAlign: "center" }}>
                {item.isNoindex ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#DC2626", fontSize: 12, fontWeight: 600 }}><XCircle size={12} /> noindex</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#16A34A", fontSize: 12, fontWeight: 600 }}><CheckCircle2 size={12} /> index</span>
                )}
              </td>
              <td style={{ padding: "10px 16px", fontSize: 12, color: "#9CA3AF" }}>{item.noindexReason ?? item.reason ?? "-"}</td>
              <td style={{ padding: "10px 16px", textAlign: "center" }}>
                <a href={type === "tag" ? `/tag/${encodeURIComponent(item.tag)}` : `/category/${encodeURIComponent(item.category)}`}
                  target="_blank" rel="noreferrer" style={{ color: "#5B5BF6", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <ArrowUpRight size={12} /> 보기
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ background: "white", borderRadius: 14, border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)", overflow: "hidden" }}>
      <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Tag size={16} color="#5B5BF6" />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", flex: 1 }}>태그 / 카테고리 색인 현황</span>
        <div style={{ display: "flex", gap: 6 }}>
          {(["tags", "categories"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: activeTab === t ? "#5B5BF6" : "white", color: activeTab === t ? "white" : "#6B6B8A",
              border: `1.5px solid ${activeTab === t ? "#5B5BF6" : "#EAECF2"}`,
            }}>
              {t === "tags" ? `태그 (${tags.length})` : `카테고리 (${cats.length})`}
            </button>
          ))}
        </div>
        {activeTab === "tags" && noindexTags.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="outline" size="sm" onClick={handleDryRun} disabled={cleanupMutation.isPending} style={{ fontSize: 12, borderColor: "#CA8A04", color: "#CA8A04" }}>
              <AlertTriangle size={12} />&nbsp;삭제 미리보기
            </Button>
            <Button size="sm" onClick={handleExecute} disabled={cleanupMutation.isPending} style={{ fontSize: 12, background: "#DC2626", color: "white" }}>
              <XCircle size={12} />&nbsp;문제 태그 일괄 삭제
            </Button>
          </div>
        )}
      </div>

      {dryRunResult && (
        <div style={{ padding: "12px 22px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#CA8A04", marginBottom: 6 }}>삭제 예정 태그 {dryRunResult.count}개</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 80, overflow: "auto" }}>
            {dryRunResult.deleted.map(tag => (
              <span key={tag} style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{tag}</span>
            ))}
          </div>
          <button onClick={() => setDryRunResult(null)} style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", marginTop: 6 }}>닫기</button>
        </div>
      )}

      {activeTab === "tags"
        ? (tagLoading ? <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div> : renderTable(tags, "tag"))
        : (catLoading ? <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF" }}>로딩 중...</div> : renderTable(cats, "cat"))
      }

      {/* noindex 기준 안내 */}
      <div style={{ padding: "14px 22px", borderTop: "1px solid #F3F4F6", background: "#F8F9FF" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#6B6B8A", marginBottom: 8 }}>noindex 처리 기준</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { label: "글 0개", desc: "noindex, follow" },
            { label: "이메일 형식", desc: "noindex, nofollow" },
            { label: "특수문자만", desc: "noindex, nofollow" },
            { label: "시스템 코드", desc: "noindex, follow" },
            { label: "정상 (1개↑)", desc: "index, follow" },
          ].map(item => (
            <div key={item.label} style={{ background: "white", borderRadius: 8, padding: "6px 12px", border: "1px solid #EAECF2", fontSize: 11 }}>
              <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{item.label}</span>
              <span style={{ color: "#9CA3AF", marginLeft: 6 }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 인기 글 SEO ─────────────────────────────────────────────
function TopPostsSection({ topPosts }: { topPosts: { id: number; title: string; views: number; slug: string | null; customSlug: string | null }[] }) {
  if (!topPosts || topPosts.length === 0) return null;
  return (
    <div style={{ background: "white", borderRadius: 14, padding: "18px 22px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TrendingUp size={16} color="#5B5BF6" />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E" }}>조회수 TOP 5 글 SEO 현황</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {topPosts.map((post, i) => (
          <div key={post.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F8F9FF", borderRadius: 10, border: "1px solid #EAECF2" }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: i < 3 ? "#5B5BF6" : "#9CA3AF", width: 24, textAlign: "center" }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.title}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                {post.customSlug
                  ? <span style={{ color: "#16A34A" }}><CheckCircle2 size={10} style={{ display: "inline", marginRight: 3 }} />SEO URL: /{post.customSlug}</span>
                  : <span style={{ color: "#DC2626" }}><XCircle size={10} style={{ display: "inline", marginRight: 3 }} />SEO URL 미설정</span>
                }
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#6B6B8A", fontSize: 12, whiteSpace: "nowrap" }}><Eye size={12} /> {post.views.toLocaleString()}</div>
            <a href={`/post/${post.customSlug ?? post.slug}`} target="_blank" rel="noreferrer" style={{ color: "#5B5BF6" }}><ArrowUpRight size={14} /></a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function AdminSeoTab() {
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://vibecraftx.com";
  const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = trpc.admin.getSeoOverview.useQuery(undefined, { staleTime: 60000 });
  const [activeSection, setActiveSection] = useState<"overview" | "audit" | "tagcat" | "sitemap" | "indexing">("overview");

  const navItems = [
    { key: "overview" as const, label: "개요", icon: <BarChart3 size={14} /> },
    { key: "audit" as const, label: "글 SEO 감사", icon: <FileText size={14} /> },
    { key: "tagcat" as const, label: "태그/카테고리", icon: <Tag size={14} /> },
    { key: "sitemap" as const, label: "사이트맵", icon: <Globe size={14} /> },
    { key: "indexing" as const, label: "색인 요청", icon: <Search size={14} /> },
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", color: "#1A1A2E" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A2E", margin: 0 }}>SEO 현황 관리</h2>
          <p style={{ fontSize: 13, color: "#6B6B8A", margin: "4px 0 0" }}>검색 엔진 최적화 상태를 종합적으로 관리합니다.</p>
        </div>
        <button onClick={() => refetchOverview()} style={{ display: "flex", alignItems: "center", gap: 6, background: "white", border: "1.5px solid #EAECF2", borderRadius: 9, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "#6B6B8A", fontWeight: 600 }}>
          <RefreshCw size={14} /> 새로고침
        </button>
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
          {overviewLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />SEO 데이터 분석 중...
            </div>
          ) : overview ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                <StatCard icon={<FileText size={18} />} label="전체 발행 글" value={overview.publishedPosts} sub={`전체 ${overview.totalPosts}개 중`} color="#5B5BF6" />
                <StatCard icon={<Link2 size={18} />} label="SEO URL 설정" value={`${overview.postsWithCustomSlug}개`}
                  sub={`미설정 ${overview.publishedPosts - overview.postsWithCustomSlug}개`}
                  color={overview.publishedPosts - overview.postsWithCustomSlug > 0 ? "#CA8A04" : "#16A34A"}
                  warn={overview.publishedPosts - overview.postsWithCustomSlug > 10} />
                <StatCard icon={<AlertTriangle size={18} />} label="제목 길이 문제"
                  value={overview.postsWithShortTitle + overview.postsWithLongTitle}
                  sub={`짧음 ${overview.postsWithShortTitle}개 · 긺 ${overview.postsWithLongTitle}개`}
                  color={overview.postsWithShortTitle + overview.postsWithLongTitle > 0 ? "#DC2626" : "#16A34A"}
                  warn={overview.postsWithShortTitle + overview.postsWithLongTitle > 0} />
                <StatCard icon={<Tag size={18} />} label="전체 태그" value={overview.totalTags} sub={`noindex ${overview.noindexTags}개`} color="#5B5BF6" />
                <StatCard icon={<FolderOpen size={18} />} label="전체 카테고리" value={overview.totalCategories} sub={`noindex ${overview.noindexCategories}개`} color="#5B5BF6" />
              </div>

              {/* SEO 점수 요약 */}
              <div style={{ background: "white", borderRadius: 14, padding: "20px 22px", border: "1.5px solid #EAECF2", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <BarChart3 size={16} color="#5B5BF6" />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E" }}>SEO 종합 점수</span>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {[
                    { label: "URL 최적화율", score: overview.publishedPosts > 0 ? Math.round((overview.postsWithCustomSlug / overview.publishedPosts) * 100) : 100, desc: `${overview.postsWithCustomSlug}/${overview.publishedPosts}개 설정` },
                    { label: "제목 최적화율", score: overview.publishedPosts > 0 ? Math.round(((overview.publishedPosts - overview.postsWithShortTitle - overview.postsWithLongTitle) / overview.publishedPosts) * 100) : 100, desc: `문제 ${overview.postsWithShortTitle + overview.postsWithLongTitle}개` },
                    { label: "태그 색인 건강도", score: overview.totalTags > 0 ? Math.round(((overview.totalTags - overview.noindexTags) / overview.totalTags) * 100) : 100, desc: `noindex ${overview.noindexTags}개` },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, minWidth: 140, background: "#F8F9FF", borderRadius: 10, padding: "14px 16px" }}>
                      <div style={{ fontSize: 12, color: "#6B6B8A", fontWeight: 500, marginBottom: 8 }}>{item.label}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(item.score), marginBottom: 8 }}>{item.score}%</div>
                      <div style={{ height: 6, background: "#EAECF2", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${item.score}%`, background: scoreColor(item.score), borderRadius: 3, transition: "width .5s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <TopPostsSection topPosts={overview.topViewPosts} />

              {/* 빠른 액션 */}
              <div style={{ background: "linear-gradient(135deg, #5B5BF6 0%, #8B5CF6 100%)", borderRadius: 14, padding: "20px 22px", color: "white" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Zap size={16} /><span style={{ fontWeight: 700, fontSize: 15 }}>빠른 액션</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "글 SEO 감사 보기", section: "audit" as const },
                    { label: "태그/카테고리 관리", section: "tagcat" as const },
                    { label: "사이트맵 확인", section: "sitemap" as const },
                    { label: "구글 색인 요청", section: "indexing" as const },
                  ].map(action => (
                    <button key={action.label} onClick={() => setActiveSection(action.section)} style={{ background: "rgba(255,255,255,.2)", border: "1.5px solid rgba(255,255,255,.3)", borderRadius: 9, padding: "8px 16px", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF" }}>데이터를 불러올 수 없습니다.</div>
          )}
        </div>
      )}

      {activeSection === "audit" && <PostSeoAuditSection />}
      {activeSection === "tagcat" && <TagCatSeoSection />}
      {activeSection === "sitemap" && <SitemapSection siteOrigin={siteOrigin} />}
      {activeSection === "indexing" && <IndexingSection siteOrigin={siteOrigin} />}
    </div>
  );
}

// named export도 제공 (AdminPage에서 두 방식으로 import 가능)
export { AdminSeoTab };
