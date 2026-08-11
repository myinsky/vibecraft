import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import Header from "../components/Header";
import SocialShareDialog from "../components/SocialShareDialog";
import RichEditor from "../components/RichEditor";
import IframeVisualEditor from "../components/IframeVisualEditor";
import HtmlVisualEditor from "../components/HtmlVisualEditor";
import SeoPreview from "../components/SeoPreview";
import { Search as SearchIcon } from "lucide-react";
import { inlineHtmlStyles, inlineHtmlStylesFullDocument } from "@/lib/htmlStyleInliner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PenSquare, Upload, Image as ImageIcon, X, Check,
  Code2, Eye, Edit3, Loader2, ArrowLeft, Star,
  Save, FileText, ChevronDown, Clock,
  FolderOpen, WrapText, Columns2,
  Monitor, Smartphone, Tablet, Paperclip,
} from "lucide-react";

// 카테고리 색상 팔레트 (categoryKey 기반 자동 배정)
const CATEGORY_COLORS = ["#7c3aed", "#e11d48", "#10b981", "#0ea5e9", "#f59e0b", "#6366f1", "#ec4899"];

// Blob URL 기반 HTML 앱 iframe 컴포넌트 (미리보기 및 실제 렌더링 공용)
function BlobIframe({ html, title }: { html: string; title?: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: "text/html; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  const handleLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc?.body) {
        const setHeight = () => {
          const h = doc.documentElement.scrollHeight || doc.body?.scrollHeight || 600;
          if (h > 100) iframe.style.height = h + "px";
        };
        setHeight();
        const ro = new ResizeObserver(setHeight);
        ro.observe(doc.body);
        iframe.addEventListener("pagehide", () => ro.disconnect(), { once: true });
      }
    } catch { /* cross-origin 무시 */ }
  };

  if (!blobUrl) return (
    <div style={{ width: "100%", minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <span style={{ color: "#94a3b8", fontSize: 14 }}>🔄 앱 로딩 중...</span>
    </div>
  );

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      style={{ width: "100%", border: "none", minHeight: 600, display: "block" }}
      onLoad={handleLoad}
      title={title || "HTML 앱 미리보기"}
    />
  );
}

/** navItem path에서 카테고리 키 추출: /category/ai-apps → ai-apps */
function extractCategoryKey(path: string): string {
  const m = path.match(/\/category\/([^/?#]+)/);
  return m ? m[1] : path.replace(/^.*\//, "");
}

type EditorTab = "editor" | "html" | "preview" | "seo";

/** HTML에서 모든 img src 추출 */
function extractImagesFromHtml(html: string): string[] {
  const results: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) results.push(m[1]);
  }
  return results;
}

/** HTML에서 첫 번째 img src 추출 */
function extractFirstImage(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

export default function WritePage() {
  const [location, navigate] = useLocation();
  // useParams가 wouter 패치 이슈로 동작하지 않을 수 있으므로 경로에서 직접 파싱
  const editMatch = location.match(/^\/write\/edit\/(\d+)/);
  const categoryMatch = location.match(/^\/write\/([^/]+)$/);
  const editId = editMatch ? parseInt(editMatch[1], 10) : undefined;
  const isEditMode = !!editId && !isNaN(editId!);
  const pathCategory = categoryMatch ? categoryMatch[1] : undefined;
  // URL 쿼리 파라미터에서 초기 제목 추출 (AI 추천 주제에서 바로 글쓰기 시 pre-fill)
  const urlSearchParams = new URLSearchParams(window.location.search);
  const initialTitle = urlSearchParams.get("title") ?? "";
  useSEO({ title: isEditMode ? "글 수정 | 스마트 오토 가이드" : "새 글 쓰기 | 스마트 오토 가이드" });
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  // 글쓰기 권한: 관리자 또는 canWrite 허용된 회원만 가능
  const canWrite = isAuthenticated && !user?.isBanned && (user?.role === "admin" || user?.canWrite === true);

  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState(pathCategory || "ai-apps");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");
  const [htmlSource, setHtmlSource] = useState("");
  const [bodyImages, setBodyImages] = useState<string[]>([]);
  const [selectedRepImage, setSelectedRepImage] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(!isEditMode);
  const thumbnailFileRef = useRef<HTMLInputElement>(null);
  // 임시저장 관련 상태
  const [draftId, setDraftId] = useState<number | undefined>(undefined);
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSeoPreview, setShowSeoPreview] = useState(false);
  // 미리보기 기기 모드: 'desktop' | 'tablet' | 'mobile'
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // autoSave 클로저에서 항상 최신값을 참조하도록 ref로 관리
  const autoSaveDataRef = useRef<{
    originalStatus: "published" | "draft";
    editId: number | null;
    title: string;
    content: string;
    htmlSource: string;
    excerpt: string;
    thumbnail: string;
    category: string;
    isHtmlSourceMode: boolean;
    isAppMode: boolean;
    appEmbedMode: string;
    appEmbedUrl: string;
    embedWidth: string;
    showInSection: boolean;
    allowComments: boolean;
    disableAds: boolean;
    enableToc: boolean;
    customSlug: string;
    coupangKeywords: string[];
  }>({
    originalStatus: "published",
    editId: null,
    title: "",
    content: "",
    htmlSource: "",
    excerpt: "",
    thumbnail: "",
    category: "",
    isHtmlSourceMode: false,
    isAppMode: false,
    appEmbedMode: "embed",
    appEmbedUrl: "",
    embedWidth: "content",
    showInSection: true,
    allowComments: true,
    disableAds: false,
    enableToc: false,
    customSlug: "",
    coupangKeywords: [],
  });
  // HTML 소스 → 에디터 전환 경고 다이얼로그
  const [showHtmlToEditorWarning, setShowHtmlToEditorWarning] = useState(false);
  // 이탈 방지: 변경 감지 상태
  const [isDirty, setIsDirty] = useState(false);
  // 이탈 경고 팝업 (SPA 내부 navigate)
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  // 이탈 확인 후 실행할 콜백
  const pendingNavigateRef = useRef<(() => void) | null>(null);
  // 뒤로가기용: App.tsx의 usePrevPathTracker가 저장한 이전 경로 사용
  const prevPathRef = useRef<string>((window as any).__prevPath || '/');
  // HTML 소스 모드 여부: DB에서 로드한 isHtmlSource 플래그로 관리 (htmlSource 유무와 분리)
  const [isHtmlSourceMode, setIsHtmlSourceMode] = useState(false);
  // HTML 입력 방식: 'normal'=일반 에디터 | 'paste'=HTML 붙여넣기(비주얼 편집) | 'file'=HTML 파일 불러오기(iframe 원본 보존)
  const [htmlInputMode, setHtmlInputMode] = useState<'normal' | 'paste' | 'file'>('normal');
  // 1번 일반 편집기 서브모드: 'text'=텍스트로 편집(Tiptap) | 'html_input'=HTML 소스 입력/편집
  const [normalSubMode, setNormalSubMode] = useState<'text' | 'html_input'>('text');
  // 1번 일반 편집기 HTML 소스 편집값 - content와 공유 (탭 전환 시 동기화)
  const [normalHtmlInput, setNormalHtmlInput] = useState('');
  // HTML → Tiptap 변환 시 에디터 강제 재마운트용 카운터
  const [editorResetKey, setEditorResetKey] = useState(0);
  // 2번 HTML 비주얼 편집 서브모드: 'source'=HTML 소스 입력 | 'visual'=비주얼 편집
  const [pasteSubMode, setPasteSubMode] = useState<'source' | 'visual'>('source');
  // 수정 모드: 원본 게시 상태 보존 (자동저장 시 status 변경 방지)
  const [originalStatus, setOriginalStatus] = useState<"published" | "draft">("draft");
  // 앱 모드: HTML 파일의 JS가 iframe에서 실행되도로 하는 모드
  const [isAppMode, setIsAppMode] = useState(false);
  // HTML 파일 + 이미지 업로드 중 상태
  const [htmlImageUploading, setHtmlImageUploading] = useState(false);
  const [htmlUploadProgress, setHtmlUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [pasteBase64Uploading, setPasteBase64Uploading] = useState(false);
  const [pasteBase64Progress, setPasteBase64Progress] = useState<{ current: number; total: number } | null>(null);
  // 업로드 실패 목록
  const [zipFailedFiles, setZipFailedFiles] = useState<string[]>([]);
  const [pasteBase64FailedCount, setPasteBase64FailedCount] = useState(0);
  // 재시도를 위한 원본 ZIP 파일 보관
  // ZIP/HTML 파일 업로드 완료 시 에디터 강제 재마운트용 카운터
  const [htmlFileLoadKey, setHtmlFileLoadKey] = useState(0);
  const [lastZipFile, setLastZipFile] = useState<File | null>(null);
  // 로컬 이미지 경로 감지 경고 (HTML 단독 업로드 시 이미지 폴더 없는 경우)
  const [localImageWarning, setLocalImageWarning] = useState<{ count: number; names: string[] } | null>(null);
  // 임베드 표시 너비: content(본문 너비) | full(전체 화면 너비)
  const [embedWidth, setEmbedWidth] = useState<"content" | "full">("content");
  // 메인 섹션/최신 글 표시 여부 (기본: true = 노출)
  const [showInSection, setShowInSection] = useState(true);
  // 댓글 사용 여부 (기본: true = 허용)
  const [allowComments, setAllowComments] = useState(true);
  // 광고 비활성화 여부 (기본: false = 광고 표시)
  const [disableAds, setDisableAds] = useState(false);
  // 목차 자동 생성 여부 (기본: false = 비활성화)
  const [enableToc, setEnableToc] = useState(false);
  // 비주얼 편집기 파일 첨부 상태
  const [visualFileUploading, setVisualFileUploading] = useState(false);
  const visualFileInputRef = useRef<HTMLInputElement>(null);
  // 비주얼 편집기 첨부 파일 목록 (맨 윗줄 표시용)
  const [visualAttachments, setVisualAttachments] = useState<Array<{ filename: string; downloadUrl: string; size: number }>>([]);
  // 파일 삽입 팝업 상태 (업로드 후 편집기에 삽입)
  const [fileInsertPopup, setFileInsertPopup] = useState<{
    open: boolean;
    afterEl: Element | null;
    insertHtml: ((html: string) => void) | null;
    uploading: boolean;
    btnColor: string;
    btnSize: 'sm' | 'md' | 'lg';
    btnAlign: 'left' | 'center' | 'right';
  }>({ open: false, afterEl: null, insertHtml: null, uploading: false, btnColor: '#2563eb', btnSize: 'md', btnAlign: 'center' });
  const fileInsertInputRef = useRef<HTMLInputElement>(null);

  // SEO 슬러그 (직접 입력, 선택적)
  const [customSlug, setCustomSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false); // 사용자가 직접 편집했는지 여부
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const slugCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slugCheckInput, setSlugCheckInput] = useState<{ slug: string; excludePostId?: number } | null>(null);

  // 제목 → 영문 슬러그 자동 변환 헬퍼
  const titleToSlug = (t: string) => {
    return t
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // 영소문자/숫자/공백/하이픈만
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  };
  // 글별 쿠팡 키워드 오버라이드 (빈 배열이면 전역 키워드 사용)
  const [coupangKeywords, setCoupangKeywords] = useState<string[]>([]);
  const [coupangKeywordInput, setCoupangKeywordInput] = useState("");
  // URL 임베드 모드
  const [appEmbedMode, setAppEmbedMode] = useState<"html" | "url">("html");
  const [appEmbedUrl, setAppEmbedUrl] = useState("");
  // 실시간 미리보기 패널 (split view)
  const [showLivePreview, setShowLivePreview] = useState(false);
  // 소셜 공유 팝업
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState<number | null>(null);
  const [publishedPostSlug, setPublishedPostSlug] = useState<string | null>(null);
  // 게시 버튼 클릭 시에만 소셜 공유 팝업 표시 (자동저장/비주얼 편집 저장 시 표시 안 함)
  const showShareOnSuccessRef = useRef(false);

  // DB navItems에서 카테고리 동적 로드
  const { data: navItemsData } = trpc.admin.getNavItems.useQuery();
  const { data: siteConfigData } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  // 전체 태그 목록 (자동완성용)
  const { data: allTagsData } = trpc.posts.getAllTags.useQuery();
  const CATEGORIES = useMemo(() => {
    if (!navItemsData || navItemsData.length === 0) {
      // fallback: 기본 카테고리
      return [
        { value: "ai-apps", label: "AI로 만드는 자동화 프로그램", color: "#7c3aed" },
        { value: "ai-tools", label: "AI 툴 추천", color: "#e11d48" },
        { value: "my-apps", label: "진행중인 자동화 프로그램", color: "#10b981" },
        { value: "resources", label: "자료실", color: "#0ea5e9" },
      ];
    }
    return navItemsData
      .filter(item => item.visible)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item, idx) => ({
        value: extractCategoryKey(item.path),
        label: item.label,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }));
  }, [navItemsData]);

  // 수정 모드: 기존 게시물 데이터 로드
  const { data: existingPost, isLoading: postLoading } = trpc.posts.get.useQuery(
    { id: editId! },
    { enabled: isEditMode }
  );
  // 원래 카테고리 저장 (수정 시 이전 카테고리 캐시 무효화용)
  const [originalCategory, setOriginalCategory] = useState<string | null>(null);
  // 수정 모드: 기존 태그 로드
  const { data: existingTags } = trpc.posts.getTags.useQuery(
    { postId: editId! },
    { enabled: isEditMode && !!editId }
  );
  // 슬러그 중복 검사
  const { data: slugCheckResult } = trpc.posts.checkSlug.useQuery(
    slugCheckInput ?? { slug: "__placeholder__" },
    { enabled: !!slugCheckInput && slugCheckInput.slug.length >= 2 }
  );
  useEffect(() => {
    if (isEditMode && existingTags) {
      setTags(existingTags);
    }
  }, [isEditMode, existingTags]);
  // 슬러그 중복 검사 결과 처리
  useEffect(() => {
    if (slugCheckResult !== undefined) {
      setSlugAvailable(slugCheckResult.available);
      setSlugChecking(false);
    }
  }, [slugCheckResult]);

  useEffect(() => {
    if (isEditMode && existingPost && !dataLoaded) {
      const origCat = existingPost.category || "ai-apps";
      setTitle(existingPost.title || "");
      setCategory(origCat);
      setOriginalCategory(origCat);
      // 원본 게시 상태 저장 (자동저장 시 status 변경 방지)
      const existingStatus = ((existingPost as any).status === "published" ? "published" : "draft") as "published" | "draft";
      setOriginalStatus(existingStatus);
      // 임시저장 글을 이어쓰기로 열었을 때: draftId를 editId로 설정하여 자동저장이 새 레코드를 만들지 않도록 함
      if (existingStatus === "draft" && editId) {
        setDraftId(editId);
      }
      setExcerpt(existingPost.excerpt || "");
      setThumbnail(existingPost.thumbnail || "");
      if ((existingPost as any).isHtmlSource) {
        // HTML 소스 모드 글: htmlSource로 자동 전환, 에디터는 비움
        setHtmlSource(existingPost.content || "");
        setIsHtmlSourceMode(true);
        setContent("");
        // HTML 소스 모드 글: 비주얼 편집 탭으로 자동 진입 (원본 구조 보존)
        // 수정 모드: 파일 불러오기 등 원본 HTML이면 file 모드, 아니면 paste 모드
        const isFullHtml = /^\s*(<!DOCTYPE|<html)/i.test((existingPost.content || "").trim());
        setHtmlInputMode(isFullHtml ? 'file' : 'paste');
        // 비주얼 편집 탭으로 자동 진입 (소스 탭 아니라 비주얼 편집)
        setPasteSubMode('visual');
        // 앱 모드 복원
        setIsAppMode(!!(existingPost as any).isAppMode);
        // 임베드 너비 복원
        setEmbedWidth(((existingPost as any).embedWidth as "content" | "full") || "content");
        // 섹션 노출 여부 복원
        setShowInSection((existingPost as any).showInSection !== false);
        // 댓글 사용 여부 복원
        setAllowComments((existingPost as any).allowComments !== false);
        // 광고 비활성화 복원
        setDisableAds((existingPost as any).disableAds === true);
        // 목차 자동 생성 복원
        setEnableToc((existingPost as any).enableToc === true);
        // SEO 슬러그 복원
        const savedCustomSlug = (existingPost as any).customSlug || "";
        setCustomSlug(savedCustomSlug);
        setSlugEdited(!!savedCustomSlug); // 저장된 슬러그가 있으면 편집된 것으로 간주
        setSlugAvailable(null);
        // 쿠팡 키워드 복원
        try {
          const kw = (existingPost as any).coupangKeywords;
          setCoupangKeywords(kw ? JSON.parse(kw) : []);
        } catch { setCoupangKeywords([]); }
        // URL 임베드 모드 복원
        const savedEmbedUrl = (existingPost as any).appEmbedUrl || "";
        setAppEmbedUrl(savedEmbedUrl);
        setAppEmbedMode(savedEmbedUrl ? "url" : "html");
      } else {
        setContent(existingPost.content || "");
        setHtmlSource("");
        setActiveTab("editor");
      }
      setDataLoaded(true);
    }
  }, [isEditMode, existingPost, dataLoaded]);

  // isDirty: 제목/본문/HTML소스 변경 감지
  // 새 글 작성 모드: 제목/본문/HTML소스 중 하나라도 입력되면 dirty
  // 수정 모드: 데이터 로딩 후 원본값과 다를 때 dirty
  const initialTitleRef = useRef("");
  const initialContentRef = useRef("");
  const initialHtmlSourceRef = useRef("");
  const dirtyInitializedRef = useRef(false);

  // 수정 모드: 데이터 로딩 완료 시 한 번만 초기값 기록
  useEffect(() => {
    if (!isEditMode) return; // 새 글 작성 모드는 초기값이 모두 ""이므로 스킵
    if (!dataLoaded) return;
    if (dirtyInitializedRef.current) return;
    dirtyInitializedRef.current = true;
    initialTitleRef.current = title;
    initialContentRef.current = content;
    initialHtmlSourceRef.current = htmlSource;
  }, [isEditMode, dataLoaded, title, content, htmlSource]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEditMode) {
      // 수정 모드: 원본값과 다를 때 dirty
      if (!dirtyInitializedRef.current) return; // 로딩 전에는 dirty 체크 안 함
      const changed =
        title !== initialTitleRef.current ||
        content !== initialContentRef.current ||
        htmlSource !== initialHtmlSourceRef.current;
      setIsDirty(changed);
    } else {
      // 새 글 작성 모드: 제목/본문/HTML소스 중 하나라도 입력되면 dirty
      const hasInput = title.trim() !== "" || content.trim() !== "" || htmlSource.trim() !== "";
      setIsDirty(hasInput);
    }
  }, [isEditMode, title, content, htmlSource]);

  // Ctrl+Z 브라우저 뒤로가기 방지 (편집기 활성 시 Ctrl+Z가 브라우저 뒤로가기로 작동하는 문제 방지)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const activeEl = document.activeElement;
        // INPUT/TEXTAREA/SELECT에 포커스가 있으면 무시 (일반 텍스트 입력 필드)
        const isInInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
        // contenteditable 요소(Tiptap 에디터)에 포커스가 있으면 무시 → Tiptap 자체 undo 허용
        const isInContentEditable = activeEl && (activeEl as HTMLElement).isContentEditable;
        // IFRAME에 포커스가 있으면 무시 → IframeVisualEditor 자체 undo 허용
        const isInIframe = activeEl && activeEl.tagName === 'IFRAME';
        if (!isInInput && !isInContentEditable && !isInIframe) {
          // 편집기 영역 외부에서만 브라우저 기본 동작 차단 (뒤로가기 방지)
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);
  // beforeunload: 브라우저 새로고침/탭 닫기 경고
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "작성 중인 내용이 있습니다. 페이지를 떠나면 변경사항이 저장되지 않습니다.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // SPA 이탈 확인 후 navigate 실행 헬퍼
  const safeNavigate = useCallback((action: () => void) => {
    if (!isDirty) {
      action();
      return;
    }
    pendingNavigateRef.current = action;
    setShowLeaveWarning(true);
  }, [isDirty]);

  // 뒤로가기 헬퍼: prevPathRef에 저장된 이전 경로로 이동, 없으면 홈으로
  const handleGoBack = useCallback(() => {
    safeNavigate(() => {
      const prev = prevPathRef.current;
      // 같은 사이트 내 경로이면 SPA navigate, 외부이면 홈으로
      if (prev && prev.startsWith('/') && !prev.startsWith('/write')) {
        navigate(prev);
      } else {
        navigate('/');
      }
    });
  }, [safeNavigate, navigate]);

  // content가 바뀔 때 본문 이미지 목록 갱신
  useEffect(() => {
    const imgs = extractImagesFromHtml(content);
    // base64 이미지는 썸네일 목록에서 제외 (DB varchar(500) 제한 초과 방지)
    const validImgs = imgs.filter(src => !src.startsWith("data:"));
    setBodyImages(validImgs);
    // 썸네일이 비어 있고 유효한 URL 이미지가 있을 때만 자동 설정 (base64 제외)
    if (!thumbnail && validImgs.length > 0) {
      setThumbnail(validImgs[0]);
    }
  }, [content]);

  // 탭 전환 함수 - 이제 탭이 없으므로 사용 안 함

  // 대표 이미지 선택 → 썸네일로 설정
  const handleSelectRepImage = (src: string) => {
    setSelectedRepImage(src);
    setThumbnail(src);
    toast.success("대표 이미지가 설정되었습니다.");
  };

  // 썸네일 파일 업로드
  const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024; // 5MB
  const handleThumbnailUpload = useCallback(async (file: File) => {
    if (file.size > MAX_THUMBNAIL_SIZE) {
      toast.error(`이미지 크기가 너무 큽니다. 5MB 이하의 파일만 업로드할 수 있습니다. (현재: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }
    setThumbnailUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "업로드 실패" }));
        throw new Error(err.error || "업로드 실패");
      }
      const data = await res.json();
      setThumbnail(data.url);
      toast.success("썸네일이 업로드되었습니다.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "썸네일 업로드 실패");
    } finally {
      setThumbnailUploading(false);
    }
  }, []);

  // 임시저장 뮤테이션
  const saveDraftMutation = trpc.posts.saveDraft.useMutation({
    onSuccess: (result) => {
      setDraftId(result.id);
      setLastSavedAt(new Date());
      setDraftSaving(false);
      // 임시저장 성공 시 isDirty 초기화 (초기값 갱신)
      initialTitleRef.current = title;
      initialContentRef.current = content;
      initialHtmlSourceRef.current = htmlSource;
      setIsDirty(false);
      // 수동 저장 시에만 토스트 (자동저장은 조용히)
      if ((saveDraftMutation as any)._manualSave) {
        toast.success("임시저장되었습니다.");
        (saveDraftMutation as any)._manualSave = false;
      }
    },
    onError: (err) => {
      setDraftSaving(false);
      const msg = err.message?.slice(0, 120) || "알 수 없는 오류";
      toast.error("임시저장 실패: " + msg);
    },
  });

  // 임시저장 목록 조회
  const { data: drafts, refetch: refetchDrafts } = trpc.posts.listDrafts.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // 임시저장 실행 함수
  const handleSaveDraft = useCallback(() => {
    if (!isAuthenticated) return;
    const finalContent = isHtmlSourceMode ? htmlSource : content;
    setDraftSaving(true);
    saveDraftMutation.mutate({
      title: title.trim() || "(제목 없음)",
      content: finalContent,
      excerpt: excerpt.trim() || null,
      thumbnail: thumbnail || null,
      category: category,
      draftId,
    });
  }, [isAuthenticated, isHtmlSourceMode, htmlSource, content, title, excerpt, thumbnail, category, draftId, saveDraftMutation]);

  // autoSaveDataRef: 자동저장 클로저에서 항상 최신값을 참조하도록 동기화
  useEffect(() => {
    autoSaveDataRef.current = {
      originalStatus, editId: editId ?? null, title, content, htmlSource,
      excerpt, thumbnail, category, isHtmlSourceMode, isAppMode,
      appEmbedMode, appEmbedUrl, embedWidth, showInSection, allowComments,
      disableAds, enableToc, customSlug, coupangKeywords,
    };
  });

  // 10초 자동저장 (새 글 작성 모드 + 수정 모드 모두, 변경이 있을 때)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const hasContent = title.trim() || content.trim() || htmlSource.trim();
    if (!hasContent) return;
    if (!isDirty) return; // 변경사항 없으면 자동저장 불필요
    autoSaveTimerRef.current = setTimeout(() => {
      // ref를 통해 항상 최신값 사용 (클로저 문제 해결)
      const d = autoSaveDataRef.current;
      if (isEditMode && d.editId) {
        // 수정 모드: updatePost로 자동저장 - 원본 게시 상태(originalStatus) 유지
        const finalContent = d.isHtmlSourceMode ? d.htmlSource : d.content;
        updatePost.mutate({
          id: d.editId,
          title: d.title.trim() || "(제목 없음)",
          content: finalContent,
          excerpt: d.excerpt.trim() || null,
          thumbnail: d.thumbnail || null,
          category: d.category,
          isHtmlSource: d.isHtmlSourceMode,
          isAppMode: d.isHtmlSourceMode ? d.isAppMode : false,
          appEmbedUrl: d.isHtmlSourceMode && d.appEmbedMode === "url" ? d.appEmbedUrl || null : null,
          embedWidth: d.isHtmlSourceMode ? (d.embedWidth as "content" | "full") : "content",
          showInSection: d.showInSection,
          allowComments: d.allowComments,
          disableAds: d.disableAds,
          enableToc: d.enableToc,
          customSlug: d.customSlug.trim() || null,
          coupangKeywords: d.coupangKeywords.length > 0 ? d.coupangKeywords : null,
          status: d.originalStatus, // 원본 게시 상태 유지 (게시된 글은 published 유지)
        });
      } else {
        handleSaveDraft();
      }
    }, 10000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, htmlSource, isEditMode, isAuthenticated, isDirty, handleSaveDraft]);

  const setTagsMutation = trpc.posts.setTags.useMutation();
  const deleteDraftMutation = trpc.posts.delete.useMutation();

  const generateTagsMutation = trpc.posts.generateTags.useMutation();
  const generateExcerptMutation = trpc.posts.generateExcerpt.useMutation();

  const createPost = trpc.posts.create.useMutation({
    onSuccess: (result) => {
      toast.success("게시물이 성공적으로 등록되었습니다!");
      // 발행 성공 시 isDirty 초기화
      setIsDirty(false);
      const postId = (result as any)?.id || (result as any)?.insertId;
      if (postId && tags.length > 0) {
        setTagsMutation.mutate({ postId, tags });
      }
      // 발행 성공 시 임시저장 자동 삭제 (중복 임시글 방지)
      if (draftId) {
        deleteDraftMutation.mutate({ id: draftId });
        setDraftId(undefined);
      }
      if (postId) {
        // 소셜 공유 팝업 표시
        setPublishedPostId(postId);
        const _newSlug = (result as any)?.customSlug || (result as any)?.slug || null;
        setPublishedPostSlug(_newSlug);
        setShowShareDialog(true);
      } else {
        navigate(`/category/${category}`);
      }
    },
    onError: (err) => {
      const msg = err.message?.slice(0, 120) || "알 수 없는 오류";
      toast.error("게시물 등록 실패: " + msg);
    },
  });

  const utils = trpc.useUtils();
  const updatePost = trpc.posts.update.useMutation({
    onSuccess: (updResult, variables) => {
      // 수정/임시저장 성공 시 isDirty 초기화
      initialTitleRef.current = title;
      initialContentRef.current = content;
      initialHtmlSourceRef.current = htmlSource;
      setIsDirty(false);
      // 카테고리 캐시 무효화
      if (originalCategory) {
        utils.posts.list.invalidate({ category: originalCategory });
      }
      if (variables.category) {
        utils.posts.list.invalidate({ category: variables.category });
      }
      utils.posts.list.invalidate({});
      utils.posts.get.invalidate({ id: editId });
      utils.posts.getBySlug.invalidate();
      // 태그 저장
      if (editId) {
        setTagsMutation.mutate({ postId: editId, tags });
      }
      if (variables.status === "draft") {
        // 임시저장: 현재 페이지에 머물며 토스트 표시
        toast.success("임시저장되었습니다.");
      } else if (showShareOnSuccessRef.current) {
        // 게시 버튼 클릭으로 발행된 경우에만 소셜 공유 팝업 표시
        showShareOnSuccessRef.current = false;
        toast.success("게시물이 발행되었습니다!");
        // 발행 성공 시 draftId 정리 (임시저장 글을 이어쓰기로 발행한 경우 editId===draftId이므로 별도 삭제 불필요)
        setDraftId(undefined);
        if (editId) {
          setPublishedPostId(editId);
          const _updSlug = (updResult as any)?.customSlug || (updResult as any)?.slug || null;
          setPublishedPostSlug(_updSlug);
          setShowShareDialog(true);
        } else {
          navigate(`/post/${editId}`);
        }
      } else {
        // 자동저장 또는 비주얼 편집 저장: 팝업 없이 토스트만 표시
        toast.success("저장되었습니다.");
      }
    },
    onError: (err) => {
      const msg = err.message?.slice(0, 120) || "알 수 없는 오류";
      toast.error("게시물 수정 실패: " + msg);
    },
  });

  const isPending = createPost.isPending || updatePost.isPending || generateTagsMutation.isPending || generateExcerptMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      window.location.href = getLoginUrl(window.location.pathname);
      return;
    }
    if (!title.trim()) { toast.error("제목을 입력해주세요."); return; }
    // HTML 소스 모드 여부: isHtmlSourceMode state 사용 (htmlSource 유무가 아니라 명시적 플래그 기반)
    let finalContent = isHtmlSourceMode ? htmlSource : content;
    const plainText = finalContent.replace(/<[^>]+>/g, "").trim();
    // 빈 HTML 태그만 있는 경우도 빈 내용으로 처리 (예: <p><br></p>, <p></p>)
        if (!plainText) { toast.error("본문 내용을 입력해주세요."); return; }
    // HTML 소스 모드: 원본 HTML 구조를 그대로 보존
    // IframeVisualEditor가 <style> 태그를 직접 적용하므로 인라인 변환 불필요
    // (PostDetail도 BlobIframe으로 렌더링하므로 원본 CSS 그대로 적용됨)
    // base64 이미지 업로드는 서버(routers.ts normalizeBase64Images)에서 처리됩니다.
    // 클라이언트에서 중복 처리하지 않습니다.

    // 썸네일: base64인 경우 S3 업로드 후 URL로 교체
    let resolvedThumbnail = thumbnail;
    if (resolvedThumbnail && resolvedThumbnail.startsWith("data:")) {
      try {
        const res = await fetch(resolvedThumbnail);
        const blob = await res.blob();
        const ext = blob.type.split("/")[1] || "png";
        const file = new File([blob], `thumb.${ext}`, { type: blob.type });
        const formData = new FormData();
        formData.append("file", file);
        const uploadRes = await fetch("/api/upload/image", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          resolvedThumbnail = url;
          setThumbnail(url); // 상태도 업데이트
        } else {
          resolvedThumbnail = ""; // 업로드 실패 시 썸네일 없음으로 처리
        }
      } catch {
        resolvedThumbnail = ""; // 오류 시 썸네일 없음으로 처리
      }
    }
    // 썸네일: 명시적 설정 > 본문 첫 이미지 자동 추출 (base64 제외)
    const firstBodyImg = extractFirstImage(finalContent);
    const finalThumbnail = resolvedThumbnail ||
      (firstBodyImg && !firstBodyImg.startsWith("data:") ? firstBodyImg : undefined) ||
      undefined;

    if (isEditMode && editId) {
      // 게시 버튼 클릭: 소셜 공유 팝업 표시 플래그 설정
      showShareOnSuccessRef.current = true;
      updatePost.mutate({
        id: editId,
        title: title.trim(),
        content: finalContent,
        excerpt: excerpt.trim() || null,
        thumbnail: finalThumbnail || null,
        category: category,
        isHtmlSource: isHtmlSourceMode,
        isAppMode: isHtmlSourceMode ? isAppMode : false,
        appEmbedUrl: isHtmlSourceMode && appEmbedMode === "url" ? appEmbedUrl || null : null,
        embedWidth: isHtmlSourceMode ? embedWidth : "content",
        showInSection,
        allowComments,
        disableAds,
        enableToc,
        customSlug: customSlug.trim() || null,
        coupangKeywords: coupangKeywords.length > 0 ? coupangKeywords : null,
        status: "published", // 게시 버튼 클릭 시 명시적으로 published 설정
      });
      } else {
        // 태그 미입력 시 LLM으로 자동 생성
      if (tags.length === 0) {
        try {
          toast.info("태그를 자동으로 분석 중...");
          const result = await generateTagsMutation.mutateAsync({
            title: title.trim(),
            content: finalContent,
          });
          if (result.tags && result.tags.length > 0) {
            setTags(result.tags);
            // 태그 자동 생성 후 게시 진행 (setTags는 비동기이므로 result.tags 직접 사용)
            createPost.mutate({
              title: title.trim(),
              content: finalContent,
              excerpt: excerpt.trim() || undefined,
              thumbnail: finalThumbnail,
              category: category,
              isHtmlSource: isHtmlSourceMode,
              isAppMode: isHtmlSourceMode ? isAppMode : false,
              appEmbedUrl: isHtmlSourceMode && appEmbedMode === "url" ? appEmbedUrl || undefined : undefined,
              embedWidth: isHtmlSourceMode ? embedWidth : "content",
              showInSection,
              allowComments,
              disableAds,
              enableToc,
              customSlug: customSlug.trim() || undefined,
              coupangKeywords: coupangKeywords.length > 0 ? coupangKeywords : undefined,
            });
            return;
          }
        } catch {
          // 태그 자동 생성 실패 시 태그 없이 게시 진행
        }
      }
      createPost.mutate({
        title: title.trim(),
        content: finalContent,
        excerpt: excerpt.trim() || undefined,
        thumbnail: finalThumbnail,
        category: category,
        isHtmlSource: isHtmlSourceMode,
        isAppMode: isHtmlSourceMode ? isAppMode : false,
        appEmbedUrl: isHtmlSourceMode && appEmbedMode === "url" ? appEmbedUrl || undefined : undefined,
        embedWidth: isHtmlSourceMode ? embedWidth : "content",
        showInSection,
        allowComments,
        disableAds,
        enableToc,
        customSlug: customSlug.trim() || undefined,
        coupangKeywords: coupangKeywords.length > 0 ? coupangKeywords : undefined,
      });
    }
  };
  // 수정 모드: 데이터 로딩 중중
  if (isEditMode && (postLoading || !dataLoaded)) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12, color: "#6b7280" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite" }} />
          <span>게시물을 불러오는 중...</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // 수정 모드: 게시물 없음 또는 조회 실패
  if (isEditMode && dataLoaded && !existingPost) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "80px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>😕</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#6b7280", marginBottom: 8 }}>게시물을 찾을 수 없습니다</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>삭제되었거나 수정 권한이 없는 게시물입니다.</div>
          <a href="/" style={{ padding: "10px 24px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none" }}>홈으로</a>
        </div>
      </div>
    );
  }

  // 글쓰기 권한 없음 안내
  if (!authLoading && isAuthenticated && !canWrite) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "100px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>글쓰기 권한이 없습니다</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>관리자에게 글쓰기 권한을 요청해주세요.</div>
          <button type="button"
            onClick={() => window.history.back()}
            style={{ padding: "10px 28px", background: "#6366f1", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}
          >돌아가기</button>
        </div>
      </div>
    );
  }
  // 로그인 필요 안내
  if (!authLoading && !isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', sans-serif" }}>
        <Header />
        <div style={{ textAlign: "center", padding: "100px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>로그인이 필요합니다</div>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>글을 작성하려면 먼저 로그인해주세요.</div>
          <a
            href={getLoginUrl(window.location.pathname)}
            style={{
              padding: "10px 28px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#fff",
              textDecoration: "none",
            }}
          >로그인하기</a>
        </div>
      </div>
    );
  }

  const selectedCat = CATEGORIES.find(c => c.value === category);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif" }}>
      <Header />

      <div style={{ maxWidth: 1310, margin: "0 auto", padding: "10px 16px 80px" }}>
        {/* Page title bar - form과 동일한 폭으로 중앙 정렬 */}
        <div style={{ maxWidth: 966, margin: "0 auto", width: "100%", marginBottom: 16, display: showShareDialog ? "none" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button"
              onClick={handleGoBack}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#6b7280", display: "flex", alignItems: "center", gap: 5,
                fontSize: 13, padding: 0,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#6366f1"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#6b7280"}
            >
              <ArrowLeft size={15} /> 뒤로
            </button>
            <div style={{ width: 1, height: 16, background: "#e5e7eb" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 10px rgba(99,102,241,0.4)",
              }}>
                <PenSquare size={13} color="#fff" />
              </div>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>{isEditMode ? "글 수정" : "새 글 작성"}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "nowrap" }}>
            {/* 임시저장 버튼 (새 글 작성 모드에서만) */}
            {!isEditMode && isAuthenticated && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => {
                    (saveDraftMutation as any)._manualSave = true;
                    handleSaveDraft();
                  }}
                  disabled={draftSaving}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "9px 16px", borderRadius: 8,
                    background: "#ffffff",
                    border: "1.5px solid #2a2a45",
                    fontSize: 12, fontWeight: 700,
                    color: draftSaving ? "#6b7280" : "#6b7280",
                    cursor: draftSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {draftSaving
                    ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : <Save size={13} />}
                  {draftSaving ? "저장 중..." : "임시저장"}
                </button>
              </div>
            )}
            {/* 임시저장 목록 버튼 */}
            {!isEditMode && isAuthenticated && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => { setShowDraftPanel(v => !v); refetchDrafts(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "9px 14px", borderRadius: 8,
                    background: "#ffffff",
                    border: "1.5px solid #2a2a45",
                    fontSize: 12, fontWeight: 700,
                    color: "#6b7280",
                    cursor: "pointer",
                  }}
                >
                  <FileText size={13} />
                  임시저장 목록
                  {drafts && drafts.length > 0 && (
                    <span style={{
                      background: "#6366f1", color: "#fff",
                      borderRadius: "50%", width: 16, height: 16,
                      fontSize: 10, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{drafts.length}</span>
                  )}
                  <ChevronDown size={12} style={{ transform: showDraftPanel ? "rotate(180deg)" : "none", transition: "0.2s" }} />
                </button>
                {/* 드래프트 패널 드롭다운 */}
                {showDraftPanel && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    width: 320, background: "#ffffff",
                    border: "1.5px solid #2a2a45", borderRadius: 12,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    zIndex: 1000, overflow: "hidden",
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #2a2a45", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>임시저장 목록</span>
                      <button type="button" onClick={() => setShowDraftPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}>
                        <X size={14} />
                      </button>
                    </div>
                    {!drafts || drafts.length === 0 ? (
                      <div style={{ padding: "24px 16px", textAlign: "center", color: "#6b7280", fontSize: 12 }}>
                        임시저장된 글이 없습니다.
                      </div>
                    ) : (
                      <div style={{ maxHeight: 320, overflowY: "auto" }}>
                        {drafts.map((draft) => (
                          <div key={draft.id} style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #1e1e35",
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {draft.title || "(제목 없음)"}
                              </div>
                              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                                <Clock size={9} />
                                {new Date(draft.updatedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigate(`/write/edit/${draft.id}`);
                                setShowDraftPanel(false);
                              }}
                              style={{
                                padding: "5px 12px", borderRadius: 6,
                                background: "rgba(99,102,241,0.15)",
                                border: "1px solid rgba(99,102,241,0.3)",
                                color: "#6366f1", fontSize: 11, fontWeight: 700,
                                cursor: "pointer", whiteSpace: "nowrap",
                              }}
                            >이어쓰기</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ padding: "10px 16px", borderTop: "1px solid #2a2a45" }}>
                      <a
                        href="/drafts"
                        style={{ fontSize: 11, color: "#6366f1", textDecoration: "none", fontWeight: 700 }}
                      >임시저장 전체 보기 →</a>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 마지막 저장 시간 표시 */}
            {lastSavedAt && !isEditMode && (
              <span style={{ fontSize: 10, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                <Check size={10} style={{ color: "#10b981" }} />
                {lastSavedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 저장됨
              </span>
            )}
            {/* 수정 모드: 임시저장 버튼 */}
            {isEditMode && (
              <button
                type="button"
                disabled={isPending}
                onClick={async () => {
                  // 폼 제출 없이 임시저장으로 저장
                  if (!title.trim()) { toast.error("제목을 입력해주세요."); return; }
                  const finalContent = isHtmlSourceMode ? htmlSource : content;
                  if (!finalContent.replace(/<[^>]+>/g, "").trim()) { toast.error("본문 내용을 입력해주세요."); return; }
                  if (editId) {
                    updatePost.mutate({
                      id: editId,
                      title: title.trim(),
                      content: finalContent,
                      excerpt: excerpt.trim() || null,
                      thumbnail: thumbnail || null,
                      category: category,
                      status: "draft",
                    });
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 18px", borderRadius: 8,
                  background: "transparent",
                  border: "1.5px solid #e5e7eb", fontSize: 13, fontWeight: 700,
                  color: "#6b7280",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                임시저장
              </button>
            )}
            {/* 미리보기 버튼 */}
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8,
                background: "#ffffff",
                border: "1.5px solid #6366f1",
                fontSize: 12, fontWeight: 700,
                color: "#6366f1",
                cursor: "pointer",
              }}
            >
              <Eye size={13} /> 미리보기
            </button>
            <button
              form="write-form"
              type="submit"
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 22px", borderRadius: 8,
                background: isPending ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", fontSize: 13, fontWeight: 700,
                color: isPending ? "#6b7280" : "#fff",
                cursor: isPending ? "not-allowed" : "pointer",
                boxShadow: isPending ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
              }}
            >
              {isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <PenSquare size={14} />}
              {isPending ? (isEditMode ? "수정 중..." : "게시 중...") : (isEditMode ? "발행" : "게시하기")}
            </button>
          </div>
        </div>
        </div>

        <form id="write-form" onSubmit={handleSubmit} noValidate style={{ display: showShareDialog ? "none" : "flex", flexDirection: "column", gap: 16, maxWidth: 966, margin: "0 auto", width: "100%" }}>

          {/* ── 카테고리 ── */}
          <div style={{
            background: "#ffffff", border: "1px solid #2a2a45",
            borderRadius: 12, padding: "16px 20px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>카테고리</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  style={{
                    padding: "6px 16px", borderRadius: 20,
                    border: `1.5px solid ${category === cat.value ? cat.color : "#e5e7eb"}`,
                    background: category === cat.value ? cat.color + "22" : "transparent",
                    color: category === cat.value ? cat.color : "#6b7280",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >{cat.label}</button>
              ))}
            </div>
            {selectedCat && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: selectedCat.color, display: "inline-block" }} />
                <span style={{ fontSize: 11, color: selectedCat.color, fontWeight: 700 }}>{selectedCat.label}</span>
              </div>
            )}
          </div>

          {/* ── 제목 ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              제목 <span style={{ color: "#e11d48" }}>*</span>
            </div>
            <input
              type="text"
              value={title}
              onChange={e => {
                setTitle(e.target.value);
                // 사용자가 직접 편집하지 않은 경우에만 제목에서 슬러그 자동 생성
                if (!slugEdited) {
                  const auto = titleToSlug(e.target.value);
                  setCustomSlug(auto);
                  setSlugAvailable(null);
                }
              }}
              placeholder="글 제목을 입력하세요"
              maxLength={200}
              style={{
                width: "100%", padding: "10px 0",
                background: "none", border: "none",
                borderBottom: "1px solid #2a2a45",
                fontSize: 22, fontWeight: 800, color: "#111827",
                outline: "none", boxSizing: "border-box",
              }}
              onFocus={e => (e.target as HTMLElement).style.borderBottomColor = "#6366f1"}
              onBlur={e => (e.target as HTMLElement).style.borderBottomColor = "#e5e7eb"}
            />
            <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280", marginTop: 4 }}>{title.length}/200</div>
          </div>

          {/* ── 요약 ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              요약 <span style={{ color: "#6b7280", fontWeight: 400, textTransform: "none" }}>(선택 · 목록에 표시)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="text"
                value={excerpt}
                onChange={e => setExcerpt(e.target.value)}
                placeholder="글 요약을 입력하세요 (비워두면 자동 생성)"
                maxLength={300}
                style={{
                  flex: 1, padding: "8px 0",
                  background: "none", border: "none",
                  borderBottom: "1px solid #2a2a45",
                  fontSize: 14, color: "#111827",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => (e.target as HTMLElement).style.borderBottomColor = "#6366f1"}
                onBlur={e => (e.target as HTMLElement).style.borderBottomColor = "#e5e7eb"}
              />
              <button
                type="button"
                disabled={generateExcerptMutation.isPending}
                onClick={async () => {
                  const src = isHtmlSourceMode ? htmlSource : content;
                  if (!src.trim()) {
                    toast.error("본문을 먼저 작성해주세요.");
                    return;
                  }
                  try {
                    const result = await generateExcerptMutation.mutateAsync({
                      title: title || "(제목 없음)",
                      content: src,
                    });
                    if (result.excerpt) {
                      setExcerpt(result.excerpt);
                      toast.success("AI가 요약을 자동 생성했습니다.");
                    } else {
                      toast.error("요약 생성에 실패했습니다.");
                    }
                  } catch {
                    toast.error("요약 생성 중 오류가 발생했습니다.");
                  }
                }}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 700,
                  background: generateExcerptMutation.isPending ? "#e5e7eb" : "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: 6, cursor: generateExcerptMutation.isPending ? "not-allowed" : "pointer",
                  color: generateExcerptMutation.isPending ? "#9ca3af" : "#6b7280",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {generateExcerptMutation.isPending ? "생성 중..." : "AI 자동 생성"}
              </button>
            </div>
          </div>

          {/* ── SEO 슬러그 ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                SEO URL 슬러그
              </div>
              {slugEdited && (
                <button
                  type="button"
                  onClick={() => {
                    setSlugEdited(false);
                    const auto = titleToSlug(title);
                    setCustomSlug(auto);
                    setSlugAvailable(null);
                  }}
                  style={{
                    padding: "3px 8px", fontSize: 10, fontWeight: 600,
                    background: "#f3f4f6", border: "1px solid #d1d5db",
                    borderRadius: 5, cursor: "pointer", color: "#6b7280",
                  }}
                >
                  자동 생성
                </button>
              )}
            </div>
            {/* URL 미리보기 */}
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6, wordBreak: "break-all" }}>
              {siteConfigData?.siteUrl || window.location.origin}/p/<span style={{ color: customSlug ? "#2563eb" : "#d1d5db" }}>{customSlug || "(제목 입력 시 자동 생성)"}</span>
            </div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={customSlug}
                onChange={e => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setCustomSlug(val);
                  setSlugEdited(true);
                  setSlugAvailable(null);
                  // 디바운스: 500ms 후 중복 검사
                  if (slugCheckTimerRef.current) clearTimeout(slugCheckTimerRef.current);
                  if (val.length >= 2) {
                    setSlugChecking(true);
                    slugCheckTimerRef.current = setTimeout(() => {
                      setSlugCheckInput({ slug: val, excludePostId: isEditMode && existingPost?.id ? existingPost.id : undefined });
                    }, 500);
                  } else {
                    setSlugChecking(false);
                  }
                }}
                placeholder="seo-friendly-url-slug"
                maxLength={255}
                style={{
                  width: "100%",
                  padding: "8px 36px 8px 10px",
                  fontSize: 13,
                  border: slugAvailable === false
                    ? "1px solid #ef4444"
                    : slugAvailable === true
                    ? "1px solid #22c55e"
                    : "1px solid #d1d5db",
                  borderRadius: 7,
                  outline: "none",
                  fontFamily: "monospace",
                  background: "#f9fafb",
                  color: "#111827",
                  boxSizing: "border-box",
                }}
              />
              {/* 상태 아이콘 */}
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14 }}>
                {slugChecking ? "⏳" : slugAvailable === true ? "✅" : slugAvailable === false ? "❌" : ""}
              </span>
            </div>
            {/* 안내 메시지 */}
            <div style={{ fontSize: 10, color: slugAvailable === false ? "#ef4444" : "#9ca3af", marginTop: 4 }}>
              {slugAvailable === false
                ? "⚠️ 이미 사용 중인 슬러그입니다. 다른 주소를 입력해 주세요."
                : slugAvailable === true
                ? "✅ 사용 가능한 슬러그입니다."
                : "영소문자, 숫자, 하이픈(-)\ub9cc 사용 가능 · 비워두면 자동 슬러그 사용"}
            </div>
          </div>

          {/* ── SEO 미리보기 (접기/펼치기) ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "12px 16px" }}>
            <button
              type="button"
              onClick={() => setShowSeoPreview(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                SEO 미리보기
              </div>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{showSeoPreview ? "▲ 접기" : "▼ 펼치기"}</span>
            </button>
            {showSeoPreview && (
              <div style={{ marginTop: 10 }}>
                <SeoPreview
                  title={title}
                  description={excerpt}
                  url={`${siteConfigData?.siteUrl || window.location.origin}/p/${customSlug || encodeURIComponent(title.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-가-힙]/g, '').slice(0, 60) || 'post')}`}
                  image={thumbnail || undefined}
                  siteName={siteConfigData?.siteTitle || undefined}
                />
              </div>
            )}
          </div>

          {/* ── 태그 ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                태그 <span style={{ color: "#6b7280", fontWeight: 400, textTransform: "none" }}>(선택 · Enter 또는 쉼표로 추가 · 최대 20개)</span>
              </div>
              <button
                type="button"
                disabled={generateTagsMutation.isPending}
                onClick={async () => {
                  const src = isHtmlSourceMode ? htmlSource : content;
                  if (!src.trim()) {
                    toast.error("본문을 먼저 작성해주세요.");
                    return;
                  }
                  try {
                    const result = await generateTagsMutation.mutateAsync({
                      title: title || "(제목 없음)",
                      content: src,
                    });
                    if (result.tags && result.tags.length > 0) {
                      const newTags = result.tags.filter((t: string) => !tags.includes(t));
                      setTags(prev => [...prev, ...newTags].slice(0, 20));
                      toast.success(`AI가 태그 ${result.tags.length}개를 자동 생성했습니다.`);
                    } else {
                      toast.error("태그 생성에 실패했습니다.");
                    }
                  } catch {
                    toast.error("태그 생성 중 오류가 발생했습니다.");
                  }
                }}
                style={{
                  padding: "4px 10px", fontSize: 11, fontWeight: 700,
                  background: generateTagsMutation.isPending ? "#e5e7eb" : "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: 6, cursor: generateTagsMutation.isPending ? "not-allowed" : "pointer",
                  color: generateTagsMutation.isPending ? "#9ca3af" : "#6b7280",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                {generateTagsMutation.isPending ? "생성 중..." : "AI 태그 생성"}
              </button>
            </div>
            {tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {tags.map(t => (
                  <span key={t} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: "#f0f0ff", border: "1px solid #c7d2fe",
                    borderRadius: 20, padding: "3px 10px",
                    fontSize: 12, color: "#4338ca", fontWeight: 600,
                  }}>
                    #{t}
                    <button
                      type="button"
                      onClick={() => setTags(prev => prev.filter(x => x !== t))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6366f1", fontSize: 14, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            {/* 태그 입력 + 자동완성 드롭다운 */}
            <div style={{ position: "relative" }}>
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={e => {
                  setTagInput(e.target.value);
                  setShowTagDropdown(true);
                  setTagDropdownIndex(-1);
                }}
                onKeyDown={e => {
                  // 자동완성 드롭다운 키보드 네비게이션
                  const suggestions = (allTagsData || []).filter(
                    (item: { tag: string; count: number }) =>
                      item.tag.includes(tagInput.toLowerCase()) &&
                      !tags.includes(item.tag) &&
                      item.tag !== tagInput.toLowerCase()
                  ).slice(0, 8);
                  if (showTagDropdown && suggestions.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTagDropdownIndex(i => Math.min(i + 1, suggestions.length - 1));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTagDropdownIndex(i => Math.max(i - 1, -1));
                      return;
                    }
                    if (e.key === "Escape") {
                      setShowTagDropdown(false);
                      setTagDropdownIndex(-1);
                      return;
                    }
                    if (e.key === "Enter" && tagDropdownIndex >= 0) {
                      e.preventDefault();
                      const selected = suggestions[tagDropdownIndex];
                      if (selected && !tags.includes(selected.tag) && tags.length < 20) {
                        setTags(prev => [...prev, selected.tag]);
                      }
                      setTagInput("");
                      setShowTagDropdown(false);
                      setTagDropdownIndex(-1);
                      return;
                    }
                  }
                  if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                    e.preventDefault();
                    const newTag = tagInput.trim().replace(/,/g, "").toLowerCase();
                    if (newTag && !tags.includes(newTag) && tags.length < 20) {
                      setTags(prev => [...prev, newTag]);
                    }
                    setTagInput("");
                    setShowTagDropdown(false);
                    setTagDropdownIndex(-1);
                  } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                    setTags(prev => prev.slice(0, -1));
                  }
                }}
                onFocus={() => { if (tagInput) setShowTagDropdown(true); }}
                onBlur={() => {
                  // 드롭다운 클릭 허용을 위해 짧은 지연 후 닫기
                  setTimeout(() => setShowTagDropdown(false), 150);
                }}
                placeholder="태그 입력 후 Enter 또는 쉼표로 추가"
                maxLength={100}
                style={{
                  width: "100%", padding: "8px 0",
                  background: "none", border: "none",
                  borderBottom: "1px solid #2a2a45",
                  fontSize: 14, color: "#111827",
                  outline: "none", boxSizing: "border-box",
                }}
                onMouseEnter={e => (e.target as HTMLElement).style.borderBottomColor = "#6366f1"}
                onMouseLeave={e => { if (document.activeElement !== e.target) (e.target as HTMLElement).style.borderBottomColor = "#2a2a45"; }}
              />
              {/* 자동완성 드롭다운 */}
              {showTagDropdown && tagInput.trim() && (() => {
                const suggestions = (allTagsData || []).filter(
                  (item: { tag: string; count: number }) =>
                    item.tag.includes(tagInput.toLowerCase()) &&
                    !tags.includes(item.tag) &&
                    item.tag !== tagInput.toLowerCase()
                ).slice(0, 8);
                if (suggestions.length === 0) return null;
                return (
                  <div
                    ref={tagDropdownRef}
                    style={{
                      position: "absolute", top: "100%", left: 0, right: 0,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      zIndex: 1000,
                      overflow: "hidden",
                      marginTop: 4,
                    }}
                  >
                    <div style={{ padding: "6px 12px 4px", fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #f3f4f6" }}>
                      기존 태그 추천
                    </div>
                    {suggestions.map((item: { tag: string; count: number }, idx: number) => (
                      <div
                        key={item.tag}
                        onMouseDown={e => {
                          e.preventDefault();
                          if (!tags.includes(item.tag) && tags.length < 20) {
                            setTags(prev => [...prev, item.tag]);
                          }
                          setTagInput("");
                          setShowTagDropdown(false);
                          setTagDropdownIndex(-1);
                          tagInputRef.current?.focus();
                        }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 14px",
                          cursor: "pointer",
                          background: idx === tagDropdownIndex ? "#f0f0ff" : "transparent",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={() => setTagDropdownIndex(idx)}
                        onMouseLeave={() => setTagDropdownIndex(-1)}
                      >
                        <span
                          style={{ fontSize: 13, color: "#4338ca", fontWeight: 600 }}
                          dangerouslySetInnerHTML={{
                            __html: "#" + item.tag.replace(
                              new RegExp(tagInput.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
                              (m: string) => `<mark style="background:#e0e7ff;color:#3730a3;border-radius:2px;font-weight:700">${m}</mark>`
                            )
                          }}
                        />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>{item.count}개 글</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          {/* ── 썸네일 ── */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              썸네일 이미지
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* 현재 썸네일 미리보기 */}
              <div
                style={{
                  width: 160, height: 100, borderRadius: 8, overflow: "hidden",
                  background: "#ffffff", border: "1px solid #2a2a45",
                  flexShrink: 0, position: "relative",
                  cursor: thumbnailUploading ? "not-allowed" : "pointer",
                }}
                title="클릭하여 썸네일 이미지 업로드"
                onClick={() => { if (!thumbnailUploading) thumbnailFileRef.current?.click(); }}
              >
                {thumbnail ? (
                  <>
                    <img loading="lazy" src={thumbnail} alt="썸네일" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {/* 호버 오버레이: 클릭으로 교체 안내 */}
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "rgba(0,0,0,0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "background 0.15s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.45)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,0,0,0)")}
                    >
                      <span style={{
                        color: "#fff", fontSize: 10, fontWeight: 700,
                        opacity: 0, transition: "opacity 0.15s",
                        pointerEvents: "none",
                        textAlign: "center", padding: "0 6px",
                      }}
                        ref={el => {
                          if (!el) return;
                          const parent = el.parentElement;
                          if (!parent) return;
                          parent.onmouseenter = () => { el.style.opacity = "1"; parent.style.background = "rgba(0,0,0,0.45)"; };
                          parent.onmouseleave = () => { el.style.opacity = "0"; parent.style.background = "rgba(0,0,0,0)"; };
                        }}
                      >클릭하여 교체</span>
                    </div>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setThumbnail(""); setSelectedRepImage(null); }}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        background: "rgba(0,0,0,0.7)", border: "none",
                        borderRadius: "50%", width: 20, height: 20,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: "#fff",
                      }}
                    ><X size={11} /></button>
                  </>
                ) : (
                  <div style={{
                    width: "100%", height: "100%",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    gap: 6, color: "#6b7280",
                  }}>
                    {thumbnailUploading ? (
                      <Loader2 size={22} style={{ animation: "spin 1s linear infinite" }} />
                    ) : (
                      <>
                        <ImageIcon size={24} />
                        <span style={{ fontSize: 10 }}>클릭하여 업로드</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* 업로드 / URL 입력 */}
              <div style={{ flex: 1, minWidth: 200 }}>
                {/* 파일 업로드 버튼 */}
                <button
                  type="button"
                  onClick={() => thumbnailFileRef.current?.click()}
                  disabled={thumbnailUploading}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "8px 16px", borderRadius: 7,
                    background: "#e5e7eb", border: "1px solid #2a2a45",
                    fontSize: 12, fontWeight: 700, color: "#6b7280",
                    cursor: thumbnailUploading ? "not-allowed" : "pointer",
                    marginBottom: 8, width: "100%", justifyContent: "center",
                  }}
                >
                  {thumbnailUploading
                    ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> 업로드 중...</>
                    : <><Upload size={13} /> 컴퓨터에서 이미지 업로드</>
                  }
                </button>
                <input
                  ref={thumbnailFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleThumbnailUpload(f); }}
                />

                {/* URL 직접 입력 */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    value={thumbnail}
                    onChange={e => setThumbnail(e.target.value)}
                    placeholder="또는 이미지 URL 직접 입력"
                    style={{
                      flex: 1, padding: "7px 10px",
                      background: "#ffffff", border: "1px solid #2a2a45",
                      borderRadius: 6, fontSize: 12, color: "#111827",
                      outline: "none",
                    }}
                    onFocus={e => (e.target as HTMLElement).style.borderColor = "#6366f1"}
                    onBlur={e => (e.target as HTMLElement).style.borderColor = "#e5e7eb"}
                  />
                </div>

                {/* 본문 이미지에서 선택 */}
                {bodyImages.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                      <Star size={10} /> 본문 이미지에서 대표 이미지 선택
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {bodyImages.map((src, i) => (
                        <div
                          key={i}
                          onClick={() => handleSelectRepImage(src)}
                          style={{
                            width: 52, height: 36, borderRadius: 5,
                            overflow: "hidden", cursor: "pointer",
                            border: `2px solid ${selectedRepImage === src || thumbnail === src ? "#6366f1" : "#e5e7eb"}`,
                            position: "relative", flexShrink: 0,
                            transition: "border-color 0.15s",
                          }}
                          title={`이미지 ${i + 1}을 대표 이미지로 설정`}
                        >
                          <img loading="lazy" src={src} alt={`본문 이미지 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          {(selectedRepImage === src || thumbnail === src) && (
                            <div style={{
                              position: "absolute", inset: 0,
                              background: "rgba(99,102,241,0.4)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <Check size={14} color="#fff" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                      * 썸네일이 비어 있으면 본문 첫 이미지가 자동으로 설정됩니다
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 댓글/광고/목차 토글 ── 가로 한 줄 */}
          <div style={{ background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12, padding: "10px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* 댓글 허용 */}
              <button
                type="button"
                onClick={() => setAllowComments(prev => !prev)}
                title={allowComments ? "댓글 허용 중" : "댓글 비활성화"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 11px", borderRadius: 6,
                  border: allowComments ? "1px solid #1d4ed8" : "1px solid #d1d5db",
                  background: allowComments ? "#2563eb" : "#f9fafb",
                  color: allowComments ? "#ffffff" : "#9ca3af",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {allowComments ? (
                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M2 7L5.5 10.5L11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: "1.5px solid #9ca3af" }} />
                )}
                댓글 허용
              </button>
              {/* 광고 비활성화 */}
              <button
                type="button"
                onClick={() => setDisableAds(prev => !prev)}
                title={disableAds ? "광고 비활성화 중" : "광고 표시 중"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 11px", borderRadius: 6,
                  border: disableAds ? "1px solid #dc2626" : "1px solid #d1d5db",
                  background: disableAds ? "#dc2626" : "#f9fafb",
                  color: disableAds ? "#ffffff" : "#9ca3af",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {disableAds ? (
                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M2 7L5.5 10.5L11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: "1.5px solid #9ca3af" }} />
                )}
                광고 비활성화
              </button>
              {/* 목차 자동 생성 */}
              <button
                type="button"
                onClick={() => setEnableToc(prev => !prev)}
                title={enableToc ? "목차 자동 생성 중" : "목차 생성 비활성화"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 11px", borderRadius: 6,
                  border: enableToc ? "1px solid #059669" : "1px solid #d1d5db",
                  background: enableToc ? "#059669" : "#f9fafb",
                  color: enableToc ? "#ffffff" : "#9ca3af",
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {enableToc ? (
                  <svg width="12" height="12" viewBox="0 0 13 13" fill="none"><path d="M2 7L5.5 10.5L11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                ) : (
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, border: "1.5px solid #9ca3af" }} />
                )}
                목차 자동 생성
              </button>
              {/* 상태 텍스트 */}
              <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>
                {disableAds ? "⛔ 광고 없음" : enableToc ? "📝 목차 생성" : allowComments ? "댓글 허용" : ""}
              </span>
            </div>
          </div>

          {/* ── 쿠팡 키워드 오버라이드 (접기 형태) ── */}
          <details style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "8px 16px" }}>
            <summary style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", listStyle: "none", userSelect: "none" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>🛒 쿠팡 키워드</span>
              {coupangKeywords.length > 0 ? (
                <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>{coupangKeywords.join(", ")}</span>
              ) : (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>비워두면 전역 키워드 사용 (클릭하여 편집)</span>
              )}
            </summary>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input
                  type="text"
                  value={coupangKeywordInput}
                  onChange={e => setCoupangKeywordInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && coupangKeywordInput.trim()) {
                      e.preventDefault();
                      if (!coupangKeywords.includes(coupangKeywordInput.trim())) {
                        setCoupangKeywords(prev => [...prev, coupangKeywordInput.trim()]);
                      }
                      setCoupangKeywordInput("");
                    }
                  }}
                  placeholder="예: 개발자 노트북, 기계식 키보드"
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 6,
                    border: "1px solid #d1d5db", fontSize: 12, outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (coupangKeywordInput.trim() && !coupangKeywords.includes(coupangKeywordInput.trim())) {
                      setCoupangKeywords(prev => [...prev, coupangKeywordInput.trim()]);
                      setCoupangKeywordInput("");
                    }
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: 6, background: "#2563eb",
                    color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                  }}
                >추가</button>
              </div>
              {coupangKeywords.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {coupangKeywords.map((kw, i) => (
                    <span key={i} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "3px 10px", borderRadius: 20,
                      background: "#eff6ff", border: "1px solid #bfdbfe",
                      fontSize: 12, color: "#1d4ed8",
                    }}>
                      {kw}
                      <button
                        type="button"
                        onClick={() => setCoupangKeywords(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#93c5fd", fontSize: 14, lineHeight: 1, padding: 0 }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </details>

          {/* ── 본문 에디터 ── */}
          <div style={{
            background: "#ffffff", border: "1px solid #2a2a45", borderRadius: 12,
          }}>
          {/* 본문 헤더 - 3가지 모드 선택 버튼 (sticky 고정, 1줄) */}
            <div style={{
              borderBottom: "1px solid #e5e7eb",
              background: "#ffffff",
              borderRadius: "12px 12px 0 0",
              position: "sticky",
              top: 56,
              zIndex: 100,
              boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
            }}>
              {/* ── 1줄: 레이블 + 서브버튼 + 메인탭 ── */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px", gap: 8, flexWrap: "nowrap", minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0 }}>
                  본문 <span style={{ color: "#e11d48" }}>*</span>
                </div>

                {/* ── 서브버튼 (1번 일반 편집기) - 1줄 통합 ── */}
                {htmlInputMode === 'normal' && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (normalSubMode === 'html_input' && normalHtmlInput.trim()) {
                          setContent(normalHtmlInput);
                          setEditorResetKey(k => k + 1);
                        }
                        setNormalSubMode('text');
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                        fontSize: 11, cursor: "pointer", fontWeight: 600,
                        background: normalSubMode === 'text' ? '#f0f0ff' : '#fff',
                        color: normalSubMode === 'text' ? '#6366f1' : '#6b7280',
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                      }}
                    >
                      <Edit3 size={11} /> 텍스트로 편집
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (normalSubMode === 'text' && content.trim()) {
                          setNormalHtmlInput(content);
                        }
                        setNormalSubMode('html_input');
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                        fontSize: 11, cursor: "pointer", fontWeight: 600,
                        background: normalSubMode === 'html_input' ? '#f0f0ff' : '#fff',
                        color: normalSubMode === 'html_input' ? '#6366f1' : '#6b7280',
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                      }}
                    >
                      <Code2 size={11} /> HTML 소스
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLivePreview(v => !v)}
                      style={{
                        padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                        fontSize: 11, cursor: "pointer", fontWeight: 600,
                        background: showLivePreview ? '#f0fdf4' : '#fff',
                        color: showLivePreview ? '#166534' : '#6b7280',
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                      }}
                    >
                      <Columns2 size={11} /> {showLivePreview ? '미리보기 닫기' : '실시간 미리보기'}
                    </button>
                  </div>
                )}

                {/* ── 서브버튼 (2번 HTML 비주얼 편집) - 1줄 통합 ── */}
                {htmlInputMode === 'paste' && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => setPasteSubMode('source')}
                      style={{
                        padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                        fontSize: 11, cursor: "pointer", fontWeight: 600,
                        background: pasteSubMode === 'source' ? '#f0f0ff' : '#fff',
                        color: pasteSubMode === 'source' ? '#6366f1' : '#6b7280',
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                      }}
                    >
                      <Code2 size={11} /> HTML 소스 입력
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!htmlSource.trim()) { toast.error('HTML 소스를 먼저 입력해주세요.'); return; }
                        setPasteSubMode('visual');
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: 5, border: "1px solid #e5e7eb",
                        fontSize: 11, cursor: "pointer", fontWeight: 600,
                        background: pasteSubMode === 'visual' ? '#f0f0ff' : '#fff',
                        color: pasteSubMode === 'visual' ? '#6366f1' : '#6b7280',
                        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                      }}
                    >
                      <Eye size={11} /> 비주얼 편집
                    </button>
                    {/* 파일 첨부 버튼 */}
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        disabled={visualFileUploading}
                        style={{
                          padding: "4px 10px", borderRadius: 5, border: "1px solid #bfdbfe",
                          fontSize: 11, cursor: visualFileUploading ? 'not-allowed' : 'pointer', fontWeight: 600,
                          background: '#eff6ff', color: '#2563eb',
                          display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                          opacity: visualFileUploading ? 0.7 : 1,
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        {visualFileUploading
                          ? <><Loader2 size={11} className="animate-spin" /> 업로드 중...</>
                          : <><Paperclip size={11} /> 파일 첨부</>
                        }
                        {!visualFileUploading && (
                          <input
                            ref={visualFileInputRef}
                            type="file"
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              e.target.value = '';
                              setVisualFileUploading(true);
                              try {
                                const formData = new FormData();
                                formData.append('file', file);
                                const res = await fetch('/api/upload/file', { method: 'POST', body: formData, credentials: 'include' });
                                if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || '업로드 실패'); }
                                const data = await res.json();
                                const sizeStr = data.size < 1024 * 1024
                                  ? `${(data.size / 1024).toFixed(1)}KB`
                                  : `${(data.size / 1024 / 1024).toFixed(1)}MB`;
                                const downloadUrl = data.url.startsWith('/manus-storage/')
                                  ? `${data.url}?download=1&filename=${encodeURIComponent(data.filename)}` : data.url;
                                setVisualAttachments(prev => [...prev, { filename: data.filename, downloadUrl, size: data.size }]);
                                toast.success(`파일 첨부: ${data.filename}`);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : '파일 업로드 실패');
                              } finally {
                                setVisualFileUploading(false);
                              }
                            }}
                          />
                        )}
                      </button>
                    </div>
                    {htmlSource.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          const blob = new Blob([htmlSource], { type: 'text/html; charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const win = window.open(url, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
                          if (win) { setTimeout(() => URL.revokeObjectURL(url), 5000); }
                        }}
                        style={{
                          padding: "4px 10px", borderRadius: 5, border: "1px solid #bbf7d0",
                          fontSize: 11, cursor: "pointer", fontWeight: 600,
                          background: '#f0fdf4', color: '#166534',
                          display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
                        }}
                      >
                        <Eye size={11} /> 미리보기
                      </button>
                    )}
                  </div>
                )}

              {/* ── 3가지 모드 선택 탭 ── */}
              <div style={{ display: "flex", gap: 0, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", width: "fit-content", flexShrink: 0 }}>
                {/* 1. 일반 편집기 */}
                <button
                  type="button"
                  onClick={() => {
                    if (htmlInputMode !== 'normal') {
                      if (isHtmlSourceMode && htmlSource && !confirm('일반 편집기로 전환하면 HTML 내용이 초기화됩니다. 계속하시겠습니까?')) return;
                      setHtmlInputMode('normal');
                      setIsHtmlSourceMode(false);
                      setHtmlSource('');
                      setIsAppMode(false);
                      setNormalSubMode('text');
                    }
                  }}
                  style={{
                    padding: "6px 14px", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600,
                    background: htmlInputMode === 'normal' ? '#6366f1' : '#f0f0ff',
                    color: htmlInputMode === 'normal' ? '#fff' : '#6366f1',
                    borderRight: "1px solid #e5e7eb",
                    display: "flex", alignItems: "center", gap: 5,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Edit3 size={13} />
                  일반 편집기
                </button>

                {/* 2. HTML 비주얼 편집 */}
                <button
                  type="button"
                  onClick={() => {
                    if (htmlInputMode !== 'paste') {
                      setHtmlInputMode('paste');
                      setIsHtmlSourceMode(true);
                      setIsAppMode(false);
                      setPasteSubMode('source');
                    }
                  }}
                  style={{
                    padding: "6px 16px", border: "2px solid #2563eb", fontSize: 12, cursor: "pointer", fontWeight: 700,
                    background: htmlInputMode === 'paste' ? '#2563eb' : '#eff6ff',
                    color: htmlInputMode === 'paste' ? '#fff' : '#2563eb',
                    borderRight: "2px solid #2563eb",
                    borderRadius: "6px 0 0 6px",
                    display: "flex", alignItems: "center", gap: 5,
                    transition: 'background 0.15s, color 0.15s',
                    boxShadow: htmlInputMode === 'paste' ? '0 2px 8px rgba(37,99,235,0.35)' : '0 1px 4px rgba(37,99,235,0.15)',
                  }}
                >
                  <Code2 size={13} />
                  HTML 비주얼 편집
                </button>

                {/* 3. HTML 파일 불러오기 */}
                <button
                  type="button"
                  onClick={() => !htmlImageUploading && document.getElementById('html-file-input-3mode')?.click()}
                  disabled={htmlImageUploading}
                  style={{
                    padding: "6px 16px", fontSize: 12, cursor: htmlImageUploading ? 'not-allowed' : 'pointer', fontWeight: 700,
                    background: htmlImageUploading ? '#f59e0b' : (htmlInputMode === 'file' ? '#1d4ed8' : '#eff6ff'),
                    color: htmlImageUploading ? '#fff' : (htmlInputMode === 'file' ? '#fff' : '#1d4ed8'),
                    border: htmlImageUploading ? '2px solid #f59e0b' : '2px solid #2563eb',
                    borderLeft: '1px solid #93c5fd',
                    borderRadius: "0 6px 6px 0",
                    display: "flex", alignItems: "center", gap: 5,
                    transition: 'background 0.15s, color 0.15s',
                    position: 'relative' as const,
                    overflow: 'hidden' as const,
                    boxShadow: htmlInputMode === 'file' ? '0 2px 8px rgba(29,78,216,0.35)' : '0 1px 4px rgba(37,99,235,0.15)',
                  }}
                >
                  {htmlImageUploading
                    ? <Loader2 size={13} className="animate-spin" />
                    : <FolderOpen size={13} />}
                  {htmlImageUploading
                    ? (htmlUploadProgress
                        ? `이미지 ${htmlUploadProgress.current}/${htmlUploadProgress.total}장 업로드 중...`
                        : 'HTML 파일 분석 중...')
                    : 'HTML / ZIP 불러오기'}
                </button>
              </div>
              {/* ZIP 업로드 진행률 바 */}
              {htmlUploadProgress && htmlUploadProgress.total > 0 && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#1e1b4b', borderRadius: 8, border: '1px solid #4338ca' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>
                      이미지 업로드 중
                    </span>
                    <span style={{ fontSize: 11, color: '#c7d2fe' }}>
                      {htmlUploadProgress.current} / {htmlUploadProgress.total}장
                    </span>
                  </div>
                  <div style={{ background: '#312e81', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                      borderRadius: 4,
                      width: `${Math.round((htmlUploadProgress.current / htmlUploadProgress.total) * 100)}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>
                            )}
              {/* ZIP 업로드 실패 목록 카드 */}
              {zipFailedFiles.length > 0 && !htmlImageUploading && (
                <div style={{
                  margin: '8px 0',
                  border: '1px solid #fca5a5',
                  borderRadius: 8,
                  background: '#fff5f5',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '8px 14px',
                    background: '#fee2e2',
                    borderBottom: '1px solid #fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
                      ⚠ 업로드 실패한 이미지 {zipFailedFiles.length}장
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!lastZipFile) return;
                          setHtmlImageUploading(true);
                          setHtmlUploadProgress(null);
                          setZipFailedFiles([]);
                          try {
                            const formData = new FormData();
                            formData.append('file', lastZipFile, lastZipFile.name);
                            const res = await fetch('/api/upload/html-zip', {
                              method: 'POST',
                              body: formData,
                              credentials: 'include',
                            });
                            if (!res.ok || !res.body) throw new Error('업로드 실패');
                            const reader = res.body.getReader();
                            const decoder = new TextDecoder();
                            let buffer = '';
                            let finalData: { html: string; imageCount: number; htmlFileName: string; failedFiles?: string[] } | null = null;
                            while (true) {
                              const { done, value } = await reader.read();
                              if (done) break;
                              buffer += decoder.decode(value, { stream: true });
                              const lines = buffer.split('\n');
                              buffer = lines.pop() || '';
                              for (const line of lines) {
                                if (!line.startsWith('data: ')) continue;
                                try {
                                  const event = JSON.parse(line.slice(6));
                                  if (event.type === 'start') {
                                    if (event.total > 0) setHtmlUploadProgress({ current: 0, total: event.total });
                                  } else if (event.type === 'progress') {
                                    setHtmlUploadProgress({ current: event.current, total: event.total });
                                  } else if (event.type === 'done') {
                                    finalData = event;
                                    if (event.failedFiles && event.failedFiles.length > 0) {
                                      setZipFailedFiles(event.failedFiles);
                                    }
                                  } else if (event.type === 'error') {
                                    throw new Error(event.error || '업로드 실패');
                                  }
                                } catch { /* 파싱 오류 무시 */ }
                              }
                            }
                            if (!finalData) throw new Error('응답 없음');
                            const hasScript = /<script[\s>]/i.test(finalData.html);
                            setHtmlSource(finalData.html);
                            setHtmlFileLoadKey(k => k + 1);
                            setIsAppMode(hasScript);
                            setIsHtmlSourceMode(true);
                            setHtmlInputMode('file');
                            const imgMsg = finalData.imageCount > 0 ? ` 이미지 ${finalData.imageCount}장 업로드 완료.` : '';
                            toast.success(`재시도 완료.${imgMsg}`);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : '재시도 실패');
                          } finally {
                            setHtmlImageUploading(false);
                            setHtmlUploadProgress(null);
                          }
                        }}
                        style={{
                          padding: '4px 12px', borderRadius: 5, border: 'none',
                          background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        🔄 전체 재시도
                      </button>
                      <button
                        type="button"
                        onClick={() => setZipFailedFiles([])}
                        style={{
                          padding: '4px 10px', borderRadius: 5, border: '1px solid #fca5a5',
                          background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: '8px 14px', maxHeight: 120, overflowY: 'auto' }}>
                    {zipFailedFiles.map((name, idx) => (
                      <div key={idx} style={{
                        fontSize: 11, color: '#7f1d1d',
                        padding: '2px 0',
                        borderBottom: idx < zipFailedFiles.length - 1 ? '1px solid #fee2e2' : 'none',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{ color: '#dc2626' }}>✗</span> {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>{/* 1줄 닫기 */}
              {/* 로컬 이미지 경로 감지 경고 배너 */}
              {localImageWarning && (
                <div style={{
                  margin: '8px 0',
                  border: '2px solid #f59e0b',
                  borderRadius: 8,
                  background: '#fffbeb',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px',
                    background: '#fef3c7',
                    borderBottom: '1px solid #fde68a',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>
                        ⚠ 이미지 {localImageWarning.count}개가 로컬 경로로 참조되어 있습니다
                      </div>
                      <div style={{ fontSize: 11, color: '#78350f', lineHeight: 1.6 }}>
                        이 HTML 파일은 이미지를 로컬 폴더(예: <code style={{ background: '#fde68a', padding: '1px 4px', borderRadius: 3 }}>images/</code>)에서 불러옵니다.<br/>
                        이미지를 표시하려면 <strong>HTML 파일과 images 폴더를 함께 ZIP으로 압축</strong>한 후 다시 업로드하세요.
                      </div>
                      {localImageWarning.names.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#92400e' }}>
                          참조 경로: {localImageWarning.names.map((n, i) => (
                            <code key={i} style={{ background: '#fde68a', padding: '1px 4px', borderRadius: 3, marginRight: 4 }}>{n}</code>
                          ))}
                          {localImageWarning.count > localImageWarning.names.length && <span>외 {localImageWarning.count - localImageWarning.names.length}개</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocalImageWarning(null)}
                      style={{
                        padding: '2px 8px', borderRadius: 4, border: '1px solid #fbbf24',
                        background: '#fff', color: '#92400e', fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      닫기
                    </button>
                  </div>
                  <div style={{ padding: '8px 14px' }}>
                    <div style={{ fontSize: 11, color: '#78350f', fontWeight: 600, marginBottom: 4 }}>ZIP 압축 방법:</div>
                    <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#78350f', lineHeight: 1.8 }}>
                      <li>HTML 파일과 <code style={{ background: '#fde68a', padding: '1px 4px', borderRadius: 3 }}>images</code> 폴더를 같은 폴더에 놓습니다</li>
                      <li>두 항목을 모두 선택 후 우클릭 → <strong>압축(ZIP)</strong></li>
                      <li>생성된 ZIP 파일을 위의 버튼으로 다시 업로드합니다</li>
                    </ol>
                  </div>
                </div>
              )}
              {/* HTML / ZIP 파일 불러오기 숨겨진 input */}
              <input
                type="file"
                accept=".html,.htm,.zip"
                style={{ display: "none" }}
                id="html-file-input-3mode"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = '';

                  const isZip = file.name.toLowerCase().endsWith('.zip') ||
                    file.type === 'application/zip' ||
                    file.type === 'application/x-zip-compressed';

                  if (isZip) {
                    // ZIP 파일: SSE 스트리밍으로 진행률 실시간 표시
                    setHtmlImageUploading(true);
                    setHtmlUploadProgress(null);
                    setZipFailedFiles([]);
                    setLastZipFile(file);
                    try {
                      const formData = new FormData();
                      formData.append('file', file, file.name);
                      const res = await fetch('/api/upload/html-zip', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                      });
                      if (!res.ok || !res.body) {
                        const err = await res.json().catch(() => ({ error: '업로드 실패' }));
                        throw new Error(err.error || '업로드 실패');
                      }
                      // SSE 스트림 읽기
                      const reader = res.body.getReader();
                      const decoder = new TextDecoder();
                      let buffer = '';
                      let finalData: { html: string; imageCount: number; htmlFileName: string; failedFiles?: string[] } | null = null;
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                          if (!line.startsWith('data: ')) continue;
                          try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'start') {
                              if (event.total > 0) setHtmlUploadProgress({ current: 0, total: event.total });
                            } else if (event.type === 'progress') {
                              setHtmlUploadProgress({ current: event.current, total: event.total });
                            } else if (event.type === 'done') {
                              finalData = event;
                              if (event.failedFiles && event.failedFiles.length > 0) {
                                setZipFailedFiles(event.failedFiles);
                              }
                            } else if (event.type === 'error') {
                              throw new Error(event.error || '업로드 실패');
                            }
                          } catch (parseErr) { /* JSON 파싱 오류 무시 */ }
                        }
                      }
                      if (!finalData) throw new Error('업로드 응답을 받지 못했습니다.');
                      const hasScript = /<script[\s>]/i.test(finalData.html);
                      setHtmlSource(finalData.html);
                      setHtmlFileLoadKey(k => k + 1);
                      setIsAppMode(hasScript);
                      setIsHtmlSourceMode(true);
                      setHtmlInputMode('file');
                      const imgMsg = finalData.imageCount > 0 ? ` 이미지 ${finalData.imageCount}장 자동 업로드 완료.` : '';
                      toast.success(`ZIP 파일을 불러왔습니다.${imgMsg}${hasScript ? ' [스크립트 포함]' : ''}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'ZIP 업로드 실패');
                    } finally {
                      setHtmlImageUploading(false);
                      setHtmlUploadProgress(null);
                    }
                    return;
                  }

                  // HTML 파일: 로컈 이미지 경로 확인
                  const rawText = await file.text();
                  const hasLocalImages = /<img[^>]+src=["'](?!https?:\/\/|data:|\/)([^"']+)["']/i.test(rawText);

                  if (hasLocalImages) {
                    // 로컬 이미지 경로 감지 시 이미지 파일명 목록 추출
                    const localImgMatches = rawText.match(/<img[^>]+src=["'](?!https?:\/\/|data:|\/|blob:)([^"']+)["']/gi) || [];
                    const localImgNames = localImgMatches.map((m: string) => {
                      const srcMatch = m.match(/src=["']([^"']+)["']/i);
                      return srcMatch ? srcMatch[1] : '';
                    }).filter(Boolean).slice(0, 5);
                    // 경고 상태 저장 (에디터 위에 배너로 표시)
                    setLocalImageWarning({ count: localImgMatches.length, names: localImgNames });
                    // HTML만 일단 적용 (이미지는 깨진 상태로 표시될 수 있음)
                    const hasScript = /<script[\s>]/i.test(rawText);
                    setHtmlSource(rawText);
                    setHtmlFileLoadKey(k => k + 1);
                    setIsAppMode(hasScript);
                    setIsHtmlSourceMode(true);
                    setHtmlInputMode('file');
                    return;
                  }

                  // base64 이미지 감지 확인
                  const hasBase64Images = /data:image\/[^;]+;base64,/.test(rawText);
                  if (hasBase64Images) {
                    // base64 이미지가 있으면 SSE 스트리밍으로 서버에서 자동 변환 (진행률 표시)
                    setHtmlImageUploading(true);
                    setZipFailedFiles([]);
                    try {
                      const formData = new FormData();
                      formData.append('html', file, file.name);
                      const res = await fetch('/api/upload/html-file-sse', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                      });
                      if (!res.ok || !res.body) {
                        const err = await res.json().catch(() => ({ error: '업로드 실패' }));
                        throw new Error(err.error || '업로드 실패');
                      }
                      // SSE 스트림 읽기
                      const reader = res.body.getReader();
                      const decoder = new TextDecoder();
                      let buffer = '';
                      let finalData: { html: string; imageCount: number; failedFiles?: string[] } | null = null;
                      while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';
                        for (const line of lines) {
                          if (!line.startsWith('data: ')) continue;
                          try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'start') {
                              if (event.total > 0) setHtmlUploadProgress({ current: 0, total: event.total });
                            } else if (event.type === 'progress') {
                              setHtmlUploadProgress({ current: event.current, total: event.total });
                            } else if (event.type === 'done') {
                              finalData = event;
                              if (event.failedFiles && event.failedFiles.length > 0) {
                                setZipFailedFiles(event.failedFiles);
                              }
                            } else if (event.type === 'error') {
                              throw new Error(event.error || '업로드 실패');
                            }
                          } catch (parseErr) { /* JSON 파싱 오류 무시 */ }
                        }
                      }
                      if (!finalData) throw new Error('업로드 응답을 받지 못했습니다.');
                      const hasScript = /<script[\s>]/i.test(finalData.html);
                      setHtmlSource(finalData.html);
                      setHtmlFileLoadKey(k => k + 1);
                      setIsAppMode(hasScript);
                      setIsHtmlSourceMode(true);
                      setHtmlInputMode('file');
                      const imgMsg = finalData.imageCount > 0 ? ` 이미지 ${finalData.imageCount}장 자동 변환 완료.` : '';
                      toast.success(`HTML 파일을 불러왔습니다.${imgMsg}${hasScript ? ' [스크립트 포함]' : ''}`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'base64 이미지 변환 실패');
                      // 실패 시 원본 HTML 적용
                      const hasScript = /<script[\s>]/i.test(rawText);
                      setHtmlSource(rawText);
                      setHtmlFileLoadKey(k => k + 1);
                      setIsAppMode(hasScript);
                      setIsHtmlSourceMode(true);
                      setHtmlInputMode('file');
                    } finally {
                      setHtmlImageUploading(false);
                      setHtmlUploadProgress(null);
                    }
                    return;
                  }

                  // 로컈 이미지 없으면 바로 적용
                  const hasScript = /<script[\s>]/i.test(rawText);
                  setHtmlSource(rawText);
                  setHtmlFileLoadKey(k => k + 1);
                  setIsAppMode(hasScript);
                  setIsHtmlSourceMode(true);
                  setHtmlInputMode('file');
                  toast.success(`HTML 파일을 불러왔습니다. (${file.name})${hasScript ? ' [스크립트 포함]' : ''}`);
                }}
              />

            </div>

          {/* 편집기 영역 - 모드에 따라 분기 (실시간 미리보기 split view 지원) */}
          <div style={htmlInputMode === 'normal' && showLivePreview ? { display: 'flex', alignItems: 'stretch', gap: 0 } : undefined}>
            {/* 실시간 미리보기 활성 시 편집기를 flex 자식으로 감싸서 50% 너비 적용 */}
            <div style={htmlInputMode === 'normal' && showLivePreview ? { flex: '0 0 50%', minWidth: 0, overflow: 'hidden' } : undefined}>
            {/* ── 1번 일반 편집기 ── */}
            {htmlInputMode === 'normal' && normalSubMode === 'text' && (
              <RichEditor
                key={isEditMode ? (dataLoaded ? `edit-${editId}-${editorResetKey}` : 'edit-loading') : `new-${editorResetKey}`}
                content={content}
                onChange={setContent}
                placeholder="본문 내용을 입력하세요. 툴바에서 서식, 링크, 이미지, 파일 쳈부 등을 사용할 수 있습니다."
                minHeight={600}
                context={title || undefined}
              />
            )}

            {/* 1번 일반 편집기 - HTML 소스 탭 (content와 공유) */}
            {htmlInputMode === 'normal' && normalSubMode === 'html_input' && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 8px 8px", background: "#1e1e2e" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid #2d2d3f", background: "#16162a", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 600, fontFamily: "monospace" }}>HTML 소스</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        // 현재 content를 소스창에 동기화
                        setNormalHtmlInput(content);
                      }}
                      style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #4c4c6f", fontSize: 11, cursor: "pointer", background: "#2d2d4f", color: "#c4b5fd", fontWeight: 600 }}
                    >
                      에디터에서 가져오기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!normalHtmlInput.trim()) return;
                        // HTML 소스를 content에 반영하고 텍스트 편집 모드로 전환
                        setContent(normalHtmlInput);
                        setEditorResetKey(k => k + 1);
                        setNormalSubMode('text');
                        toast.success('텍스트 편집기에 적용했습니다.');
                      }}
                      style={{ padding: "3px 10px", borderRadius: 4, border: "none", fontSize: 11, cursor: "pointer", background: "#6366f1", color: "#fff", fontWeight: 700 }}
                    >
                      텍스트 편집에 적용
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!normalHtmlInput.trim()) { toast.error('HTML 소스를 먼저 입력해주세요.'); return; }
                        // HTML 소스를 htmlSource에 저장하고 비주얼 편집으로 전환
                        setHtmlSource(normalHtmlInput);
                        setIsHtmlSourceMode(true);
                        setHtmlInputMode('paste');
                        setPasteSubMode('visual');
                        toast.success('비주얼 편집기로 전환했습니다.');
                      }}
                      style={{ padding: "3px 10px", borderRadius: 4, border: "none", fontSize: 11, cursor: "pointer", background: "#10b981", color: "#fff", fontWeight: 700 }}
                    >
                      비주얼 편집으로 열기
                    </button>
                  </div>
                </div>
                <textarea
                  value={normalHtmlInput}
                  onChange={e => setNormalHtmlInput(e.target.value)}
                  placeholder="HTML 코드를 여기에 붙여넣거나 직접 입력하세요.&#10;텍스트 편집기에서 작성한 내용은 '에디터에서 가져오기' 버튼으로 불러올 수 있습니다."
                  style={{
                    width: "100%", minHeight: 600, padding: "14px",
                    fontFamily: "'Fira Code', 'Courier New', monospace",
                    fontSize: 13, lineHeight: 1.6, color: "#e2e8f0",
                    background: "#1e1e2e", border: "none", outline: "none",
                    resize: "vertical", boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {/* ── 2번 HTML 비주얼 편집 - 소스 입력 ── */}
            {htmlInputMode === 'paste' && pasteSubMode === 'source' && (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "0 0 8px 8px", background: "#fff" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #f3f4f6", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                    HTML 코드를 입력한 후 '비주얼 편집' 버튼을 누르면 워드프레스식 인라인 편집으로 전환됩니다.
                  </span>
                  <button
                    type="button"
                    disabled={pasteBase64Uploading}
                    onClick={async () => {
                      if (!htmlSource.trim()) { toast.error('HTML 소스를 먼저 입력해주세요.'); return; }
                      // base64 이미지 감지
                      const hasBase64 = /data:image\/[^;]+;base64,/.test(htmlSource);
                      if (hasBase64) {
                        setPasteBase64Uploading(true);
                        setPasteBase64Progress(null);
                        try {
                          const res = await fetch('/api/upload/html-base64', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ html: htmlSource }),
                            credentials: 'include',
                          });
                          if (!res.ok || !res.body) throw new Error('업로드 실패');
                          const reader = res.body.getReader();
                          const decoder = new TextDecoder();
                          let buffer = '';
                          let finalHtml = htmlSource;
                          let imageCount = 0;
                          while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';
                            for (const line of lines) {
                              if (!line.startsWith('data: ')) continue;
                              try {
                                const event = JSON.parse(line.slice(6));
                                if (event.type === 'start') {
                                  setPasteBase64Progress({ current: 0, total: event.total });
                                } else if (event.type === 'progress') {
                                  setPasteBase64Progress({ current: event.current, total: event.total });
                                } else if (event.type === 'done') {
                                  finalHtml = event.html;
                                  imageCount = event.imageCount;
                                  if (event.failedCount > 0) {
                                    setPasteBase64FailedCount(event.failedCount);
                                  }
                                } else if (event.type === 'error') {
                                  throw new Error(event.error || '변환 실패');
                                }
                              } catch { /* JSON 파싱 오류 무시 */ }
                            }
                          }
                          setHtmlSource(finalHtml);
                          setIsHtmlSourceMode(true);
                          if (imageCount > 0) toast.success(`base64 이미지 ${imageCount}장이 스토리지에 업로드되었습니다.`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : 'base64 변환 실패');
                        } finally {
                          setPasteBase64Uploading(false);
                          setPasteBase64Progress(null);
                        }
                      }
                      setPasteSubMode('visual');
                    }}
                    style={{
                      padding: "5px 14px", borderRadius: 6, border: "none",
                      background: pasteBase64Uploading ? "#4338ca" : "#6366f1",
                      color: "#fff", fontSize: 12, fontWeight: 700,
                      cursor: pasteBase64Uploading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", gap: 5,
                      opacity: pasteBase64Uploading ? 0.8 : 1,
                    }}
                  >
                    {pasteBase64Uploading
                      ? (<><Loader2 size={12} className="animate-spin" />
                          {pasteBase64Progress
                            ? `이미지 ${pasteBase64Progress.current}/${pasteBase64Progress.total}장 변환 중...`
                            : 'base64 분석 중...'}
                        </>)
                      : (<><Eye size={12} /> 비주얼 편집으로 전환</>)
                    }
                  </button>
                </div>
                <textarea
                  value={htmlSource}
                  onChange={e => { setHtmlSource(e.target.value); setIsHtmlSourceMode(true); }}
                  placeholder="<h2>제목</h2>\n<p>본문...</p>\n\nHTML 코드를 여기에 붙여넣고 '비주얼 편집으로 전환' 버튼을 누르세요."
                  style={{
                    width: "100%", minHeight: 600, padding: "14px",
                    fontFamily: "'Fira Code', 'Courier New', monospace",
                    fontSize: 13, lineHeight: 1.6, color: "#111827",
                    background: "#fafafa", border: "none", outline: "none",
                    resize: "vertical", boxSizing: "border-box",
                  }}
                />
                {/* base64 변환 실패 카드 */}
                {pasteBase64FailedCount > 0 && !pasteBase64Uploading && (
                  <div style={{
                    margin: '0',
                    border: '1px solid #fca5a5',
                    borderTop: 'none',
                    background: '#fff5f5',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '8px 14px',
                      background: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>
                        ⚠ base64 이미지 변환 실패 {pasteBase64FailedCount}장
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!htmlSource.trim()) return;
                            setPasteBase64Uploading(true);
                            setPasteBase64Progress(null);
                            setPasteBase64FailedCount(0);
                            try {
                              const res = await fetch('/api/upload/html-base64', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ html: htmlSource }),
                                credentials: 'include',
                              });
                              if (!res.ok || !res.body) throw new Error('업로드 실패');
                              const reader = res.body.getReader();
                              const decoder = new TextDecoder();
                              let buffer = '';
                              let finalHtml = htmlSource;
                              let imageCount = 0;
                              while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop() || '';
                                for (const line of lines) {
                                  if (!line.startsWith('data: ')) continue;
                                  try {
                                    const event = JSON.parse(line.slice(6));
                                    if (event.type === 'start') {
                                      setPasteBase64Progress({ current: 0, total: event.total });
                                    } else if (event.type === 'progress') {
                                      setPasteBase64Progress({ current: event.current, total: event.total });
                                    } else if (event.type === 'done') {
                                      finalHtml = event.html;
                                      imageCount = event.imageCount;
                                      if (event.failedCount > 0) setPasteBase64FailedCount(event.failedCount);
                                    } else if (event.type === 'error') {
                                      throw new Error(event.error || '변환 실패');
                                    }
                                  } catch { /* 파싱 오류 무시 */ }
                                }
                              }
                              setHtmlSource(finalHtml);
                              if (imageCount > 0) toast.success(`재시도 완료: ${imageCount}장 변환 성공`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : '재시도 실패');
                            } finally {
                              setPasteBase64Uploading(false);
                              setPasteBase64Progress(null);
                            }
                          }}
                          style={{
                            padding: '4px 12px', borderRadius: 5, border: 'none',
                            background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          🔄 재시도
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasteBase64FailedCount(0)}
                          style={{
                            padding: '4px 10px', borderRadius: 5, border: '1px solid #fca5a5',
                            background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* base64 변환 진행률 바 */}
                {pasteBase64Progress && pasteBase64Progress.total > 0 && (
                  <div style={{ padding: '8px 14px', background: '#1e1b4b', borderTop: '1px solid #4338ca' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600 }}>base64 이미지 스토리지 변환 중</span>
                      <span style={{ fontSize: 11, color: '#c7d2fe' }}>{pasteBase64Progress.current} / {pasteBase64Progress.total}장</span>
                    </div>
                    <div style={{ background: '#312e81', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                        borderRadius: 4,
                        width: `${Math.round((pasteBase64Progress.current / pasteBase64Progress.total) * 100)}%`,
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 2번 HTML 비주얼 편집 - 첨부 파일 목록 바 (맨 윗줄) */}
            {htmlInputMode === 'paste' && pasteSubMode === 'visual' && visualAttachments.length > 0 && (
              <div style={{
                background: '#f0f7ff',
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 8,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginRight: 4, whiteSpace: 'nowrap' }}>📎 첨부 파일</span>
                {visualAttachments.map((att, idx) => {
                  const sizeStr = att.size < 1024 * 1024
                    ? `${(att.size / 1024).toFixed(1)}KB`
                    : `${(att.size / 1024 / 1024).toFixed(1)}MB`;
                  return (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: '#fff', border: '1px solid #bfdbfe',
                      borderRadius: 6, padding: '4px 10px',
                    }}>
                      <a
                        href={att.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.filename}
                        style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={att.filename}
                      >
                        {att.filename}
                      </a>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>({sizeStr})</span>
                      <button
                        type="button"
                        onClick={() => setVisualAttachments(prev => prev.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0 2px', lineHeight: 1, fontSize: 14 }}
                        title="첨부 제거"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* 2번 HTML 비주얼 편집 - 비주얼 편집 (워드프레스식 iframe 기반) */}
            {htmlInputMode === 'paste' && pasteSubMode === 'visual' && (
              <IframeVisualEditor
                key={isEditMode ? (dataLoaded ? `html-visual-${editId}` : 'html-visual-loading') : 'html-visual-new'}
                minHeight={1200}
                value={htmlSource}
                onChange={(newHtml) => {
                  setHtmlSource(newHtml);
                  setIsHtmlSourceMode(true);
                }}
                onUploadImage={async (file: File) => {
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/upload/image', { method: 'POST', body: formData, credentials: 'include' });
                  if (!res.ok) throw new Error('이미지 업로드 실패');
                  const { url } = await res.json();
                  return url as string;
                }}
                adsenseSlotCode={siteConfigData?.adsense_slot1_code || siteConfigData?.adsense_slot_code || ''}
                coupangWidgetCode={siteConfigData?.coupang_enabled === 'true' && siteConfigData?.coupang_access_key ? '<div data-coupang-manual="1" style="border:2px dashed #f97316;border-radius:8px;padding:16px;text-align:center;color:#f97316;font-size:13px;font-weight:600;background:rgba(249,115,22,0.05)">🛒 쿠팡 파트너스 광고 (배포 시 자동 렌더링)</div>' : ''}
                shopConnectWidgetCode={siteConfigData?.shop_connect_enabled === 'true' ? (siteConfigData?.shop_connect_widget_code || '') : ''}
                onRequestFileInsert={(afterEl, insertHtml) => {
                  setFileInsertPopup(p => ({ ...p, open: true, afterEl, insertHtml, uploading: false }));
                }}
                hideOverlay={showShareDialog}
              />
            )}
            {/* 파일 삽입 팝업 (IframeVisualEditor + 버튼 메뉴에서 호출) */}
            {fileInsertPopup.open && (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
                onClick={(e) => { if (e.target === e.currentTarget) setFileInsertPopup(p => ({ ...p, open: false })); }}
              >
                <div style={{
                  background: '#fff', borderRadius: 12, padding: '28px 32px',
                  minWidth: 380, maxWidth: 480, width: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                  display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1e3a5f' }}>📎 파일 다운로드 버튼 삽입</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    파일을 선택하면 업로드 후 편집기에 다운로드 버튼이 삽입됩니다.
                  </div>
                  {/* 버튼 스타일 옵션 */}
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* 색상 선택 */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>버튼 색상</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          { color: '#2563eb', label: '파란' },
                          { color: '#16a34a', label: '초록' },
                          { color: '#dc2626', label: '빨강' },
                          { color: '#6b7280', label: '회색' },
                          { color: '#7c3aed', label: '보라' },
                        ].map(({ color, label }) => (
                          <button
                            key={color}
                            type="button"
                            title={label}
                            onClick={() => setFileInsertPopup(p => ({ ...p, btnColor: color }))}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', background: color,
                              border: fileInsertPopup.btnColor === color ? '3px solid #1e3a5f' : '2px solid transparent',
                              cursor: 'pointer', outline: fileInsertPopup.btnColor === color ? '2px solid #fff' : 'none',
                              outlineOffset: '-4px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    {/* 크기 선택 */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>버튼 크기</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['sm', 'md', 'lg'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setFileInsertPopup(p => ({ ...p, btnSize: sz }))}
                            style={{
                              padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: fileInsertPopup.btnSize === sz ? '2px solid #2563eb' : '1px solid #d1d5db',
                              background: fileInsertPopup.btnSize === sz ? '#eff6ff' : '#fff',
                              color: fileInsertPopup.btnSize === sz ? '#2563eb' : '#374151',
                              cursor: 'pointer',
                            }}
                          >{sz === 'sm' ? '소' : sz === 'md' ? '중' : '대'}</button>
                        ))}
                      </div>
                    </div>
                    {/* 정렬 선택 */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>버튼 정렬</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => setFileInsertPopup(p => ({ ...p, btnAlign: align }))}
                            style={{
                              padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: fileInsertPopup.btnAlign === align ? '2px solid #2563eb' : '1px solid #d1d5db',
                              background: fileInsertPopup.btnAlign === align ? '#eff6ff' : '#fff',
                              color: fileInsertPopup.btnAlign === align ? '#2563eb' : '#374151',
                              cursor: 'pointer',
                            }}
                          >{align === 'left' ? '왼쪽' : align === 'center' ? '가운데' : '오른쪽'}</button>
                        ))}
                      </div>
                    </div>
                    {/* 미리보기 */}
                    <div style={{ marginTop: 2 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>미리보기</div>
                      <div style={{ textAlign: fileInsertPopup.btnAlign }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: fileInsertPopup.btnSize === 'sm' ? '6px 16px' : fileInsertPopup.btnSize === 'lg' ? '14px 28px' : '10px 22px',
                          background: fileInsertPopup.btnColor, color: '#fff', borderRadius: 8,
                          fontSize: fileInsertPopup.btnSize === 'sm' ? 12 : fileInsertPopup.btnSize === 'lg' ? 16 : 14,
                          fontWeight: 600,
                        }}>⬇️ 파일명.pdf 다운로드</span>
                      </div>
                    </div>
                  </div>
                  {/* 이미 첨부된 파일 목록에서 선택 */}
                  {visualAttachments.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>첨부된 파일에서 선택:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {visualAttachments.map((att, idx) => {
                          const sizeStr = att.size < 1024 * 1024
                            ? `${(att.size / 1024).toFixed(1)}KB`
                            : `${(att.size / 1024 / 1024).toFixed(1)}MB`;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                const { btnColor, btnSize, btnAlign } = fileInsertPopup;
                                const pad = btnSize === 'sm' ? '6px 16px' : btnSize === 'lg' ? '14px 28px' : '10px 22px';
                                const fs = btnSize === 'sm' ? '12px' : btnSize === 'lg' ? '16px' : '14px';
                                const hexColor = btnColor.replace('#', '');
                                const r = parseInt(hexColor.slice(0,2),16), g = parseInt(hexColor.slice(2,4),16), b = parseInt(hexColor.slice(4,6),16);
                                const btnHtml = `<div style="margin:12px 0;text-align:${btnAlign}"><a href="${att.downloadUrl}" target="_blank" rel="noopener noreferrer" download="${att.filename}" style="display:inline-flex;align-items:center;gap:8px;padding:${pad};background:${btnColor};color:#fff;border-radius:8px;text-decoration:none;font-size:${fs};font-weight:600;box-shadow:0 2px 8px rgba(${r},${g},${b},0.3)">⬇️ ${att.filename} (${sizeStr}) 다운로드</a></div>`;
                                fileInsertPopup.insertHtml?.(btnHtml);
                                setFileInsertPopup(p => ({ ...p, open: false }));
                                toast.success(`'${att.filename}' 다운로드 버튼 삽입 완료`);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px', borderRadius: 7,
                                border: '1px solid #bfdbfe', background: '#eff6ff',
                                cursor: 'pointer', fontSize: 13, color: '#1d4ed8', fontWeight: 500,
                                textAlign: 'left',
                              }}
                            >
                              <span>📎</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</span>
                              <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>({sizeStr})</span>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />
                    </div>
                  )}
                  {/* 새 파일 업로드 */}
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      disabled={fileInsertPopup.uploading}
                      style={{
                        width: '100%', padding: '10px 16px', borderRadius: 8,
                        border: '2px dashed #93c5fd', background: '#f0f7ff',
                        color: '#2563eb', fontSize: 13, fontWeight: 600,
                        cursor: fileInsertPopup.uploading ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: fileInsertPopup.uploading ? 0.7 : 1,
                        position: 'relative', overflow: 'hidden',
                      }}
                    >
                      {fileInsertPopup.uploading
                        ? <><Loader2 size={14} className="animate-spin" /> 업로드 중...</>
                        : <><Paperclip size={14} /> 새 파일 선택하여 업로드</>
                      }
                      {!fileInsertPopup.uploading && (
                        <input
                          ref={fileInsertInputRef}
                          type="file"
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            e.target.value = '';
                            setFileInsertPopup(p => ({ ...p, uploading: true }));
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              const res = await fetch('/api/upload/file', { method: 'POST', body: formData, credentials: 'include' });
                              if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || '업로드 실패'); }
                              const data = await res.json();
                              const sizeStr = data.size < 1024 * 1024
                                ? `${(data.size / 1024).toFixed(1)}KB`
                                : `${(data.size / 1024 / 1024).toFixed(1)}MB`;
                              const downloadUrl = data.url.startsWith('/manus-storage/')
                                ? `${data.url}?download=1&filename=${encodeURIComponent(data.filename)}` : data.url;
                              // 첨부 파일 목록에도 추가
                              setVisualAttachments(prev => [...prev, { filename: data.filename, downloadUrl, size: data.size }]);
                              // 편집기에 다운로드 버튼 삽입 (선택된 스타일 옵션 적용)
                              const { btnColor, btnSize, btnAlign } = fileInsertPopup;
                              const pad = btnSize === 'sm' ? '6px 16px' : btnSize === 'lg' ? '14px 28px' : '10px 22px';
                              const fs = btnSize === 'sm' ? '12px' : btnSize === 'lg' ? '16px' : '14px';
                              const hexColor = btnColor.replace('#', '');
                              const r = parseInt(hexColor.slice(0,2),16), g = parseInt(hexColor.slice(2,4),16), b = parseInt(hexColor.slice(4,6),16);
                              const btnHtml = `<div style="margin:12px 0;text-align:${btnAlign}"><a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" download="${data.filename}" style="display:inline-flex;align-items:center;gap:8px;padding:${pad};background:${btnColor};color:#fff;border-radius:8px;text-decoration:none;font-size:${fs};font-weight:600;box-shadow:0 2px 8px rgba(${r},${g},${b},0.3)">⬇️ ${data.filename} (${sizeStr}) 다운로드</a></div>`;
                              fileInsertPopup.insertHtml?.(btnHtml);
                              setFileInsertPopup(p => ({ ...p, open: false, uploading: false }));
                              toast.success(`'${data.filename}' 다운로드 버튼 삽입 완료`);
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : '파일 업로드 실패');
                              setFileInsertPopup(p => ({ ...p, uploading: false }));
                            }
                          }}
                        />
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFileInsertPopup(p => ({ ...p, open: false }))}
                    style={{
                      padding: '8px', borderRadius: 7, border: '1px solid #e5e7eb',
                      background: '#f9fafb', color: '#6b7280', fontSize: 13,
                      cursor: 'pointer', fontWeight: 500,
                    }}
                  >취소</button>
                </div>
              </div>
            )}

            {/* ── 3번 HTML 파일 불러오기 ── */}
            {htmlInputMode === 'file' && (
              htmlSource ? (
                <IframeVisualEditor
                  key={dataLoaded ? `iframe-editor-${editId ?? 'new'}-loaded-${htmlFileLoadKey}` : `iframe-editor-loading-${htmlFileLoadKey}`}
                  minHeight={1200}
                  html={htmlSource}
                  onChange={(newHtml) => setHtmlSource(newHtml)}
                  isAppMode={isAppMode}
                  onUploadImage={async (file: File) => {
                    const formData = new FormData();
                    formData.append('file', file);
                    const res = await fetch('/api/upload/image', { method: 'POST', body: formData, credentials: 'include' });
                    if (!res.ok) throw new Error('이미지 업로드 실패');
                    const { url } = await res.json();
                    return url as string;
                  }}
                  adsenseSlotCode={siteConfigData?.adsense_slot1_code || siteConfigData?.adsense_slot_code || ''}
                  coupangWidgetCode={siteConfigData?.coupang_enabled === 'true' && siteConfigData?.coupang_access_key ? '<div data-coupang-manual="1" style="border:2px dashed #f97316;border-radius:8px;padding:16px;text-align:center;color:#f97316;font-size:13px;font-weight:600;background:rgba(249,115,22,0.05)">🛒 쿠팡 파트너스 광고 (배포 시 자동 렌더링)</div>' : ''}
                  shopConnectWidgetCode={siteConfigData?.shop_connect_enabled === 'true' ? (siteConfigData?.shop_connect_widget_code || '') : ''}
                  onRequestFileInsert={(afterEl, insertHtml) => {
                    setFileInsertPopup(p => ({ ...p, open: true, afterEl, insertHtml, uploading: false }));
                  }}
                />
              ) : (
                <div style={{
                  border: "2px dashed #e5e7eb", borderRadius: 8, padding: "60px 20px",
                  textAlign: "center", color: "#9ca3af", background: "#fafafa",
                }}>
                  <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                    HTML 파일을 선택하세요
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 16 }}>
                    위의 'HTML 파일 불러오기' 버튼을 눈러 .html 파일을 선택하면<br/>
                    원문 구조를 그대로 보존하면서 인라인 편집이 가능합니다.
                  </div>
                  <button
                    type="button"
                    onClick={() => document.getElementById('html-file-input-3mode')?.click()}
                    style={{
                      padding: "8px 20px", borderRadius: 8, border: "1px solid #d1d5db",
                      background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <FolderOpen size={14} /> 파일 선택하기
                  </button>
                </div>
              )
            )}
            </div>{/* /편집기 내부 래퍼 div 닫기 */}

            {/* ── 실시간 미리보기 패널 (split view, normal 모드에서만 표시) ── */}
            {htmlInputMode === 'normal' && showLivePreview && (
              <div style={{
                flex: '0 0 50%', minWidth: 0,
                borderLeft: '2px solid #e5e7eb',
                background: '#f8fafc',
                overflow: 'auto',
                maxHeight: 700,
              }}>
                {/* 미리보기 헤더 */}
                <div style={{
                  padding: '8px 16px',
                  background: '#f0fdf4',
                  borderBottom: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}>
                  <Eye size={13} style={{ color: '#166534' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#166534' }}>실시간 미리보기</span>
                  <span style={{ fontSize: 10, color: '#4ade80', marginLeft: 4 }}>실제 게시물과 동일한 스타일로 표시됩니다</span>
                </div>
                {/* 미리보기 콘텐츠 */}
                <div style={{ padding: '16px 20px' }}>
                  {/* 제목 */}
                  {title && (
                    <h1 style={{
                      fontSize: 22, fontWeight: 800, color: '#111827',
                      marginBottom: 16, lineHeight: 1.4,
                      borderBottom: '2px solid #e5e7eb', paddingBottom: 12,
                    }}>{title}</h1>
                  )}
                  {/* 본문 - normalSubMode에 따라 다르게 렌더링 */}
                  {normalSubMode === 'text' ? (
                    <div
                      className="rich-preview"
                      style={{ maxWidth: '100%', margin: 0, padding: 0 }}
                      dangerouslySetInnerHTML={{ __html: content }}
                    />
                  ) : /<style[\s>]/i.test(normalHtmlInput) ? (
                    // <style> 태그가 있는 HTML: CSS 충돌 방지를 위해 BlobIframe으로 렌더링
                    <BlobIframe
                      html={`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body{font-family:'Noto Sans KR','Malgun Gothic','Apple SD Gothic Neo',sans-serif;margin:0;padding:16px;background:#fff;}</style></head><body>${normalHtmlInput}</body></html>`}
                      title="미리보기"
                    />
                  ) : (
                    <div
                      className="html-source-content"
                      style={{ maxWidth: '100%', margin: 0, padding: 0 }}
                      dangerouslySetInnerHTML={{ __html: normalHtmlInput }}
                    />
                  )}
                  {/* 빈 콘텐츠 메시지 */}
                  {!content && !normalHtmlInput && (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '40px 0' }}>
                      편집기에 내용을 입력하면 여기에 실시간으로 표시됩니다.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </div>

          {/* ── 하단 버튼 (sticky footer) ── */}
          <div style={{
            position: "sticky", bottom: 0, zIndex: 50,
            display: "flex", gap: 10,
            background: "#f9fafb",
            borderTop: "1px solid #e5e7eb",
            padding: "12px 0",
            marginTop: 8,
          }}>
            <button
              type="button"
              onClick={handleGoBack}
              style={{
                flex: 1, padding: "12px",
                background: "#e5e7eb", border: "1px solid #2a2a45",
                borderRadius: 9, fontSize: 13, fontWeight: 700, color: "#6b7280",
                cursor: "pointer",
              }}
            >취소</button>
            <button
              type="submit"
              disabled={isPending}
              style={{
                flex: 2, padding: "12px",
                background: isPending ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", borderRadius: 9,
                fontSize: 13, fontWeight: 700,
                color: isPending ? "#6b7280" : "#fff",
                cursor: isPending ? "not-allowed" : "pointer",
                boxShadow: isPending ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              }}
            >
              <PenSquare size={14} />
              {isPending ? (isEditMode ? "수정 중..." : "게시 중...") : (isEditMode ? "수정 완료" : "게시하기")}
            </button>
          </div>
        </form>
      </div>

      {/* 미리보기 모달 */}
      {showPreviewModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            overflowY: "auto", padding: "20px 0",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPreviewModal(false); }}
        >
          <div style={{
            background: "#f9fafb", borderRadius: 16,
            width: "100%",
            maxWidth: previewDevice === 'mobile' ? 400 : previewDevice === 'tablet' ? 820 : parseInt(siteConfigData?.postContentWidth || "960", 10) + 80,
            margin: "0 auto",
            boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
            overflow: "hidden",
            transition: "max-width 0.3s ease",
          }}>
            {/* 모달 헤더 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 20px",
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              flexWrap: "wrap",
              gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Eye size={16} color="#6366f1" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>실제 화면 미리보기</span>
                <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", padding: "2px 8px", borderRadius: 20 }}>발행 후 보이는 모습과 동일</span>
              </div>
              {/* 기기별 미리보기 토글 */}
              <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                {([
                  { key: 'desktop' as const, icon: <Monitor size={14} />, label: '데스크탑' },
                  { key: 'tablet' as const, icon: <Tablet size={14} />, label: '태블릿' },
                  { key: 'mobile' as const, icon: <Smartphone size={14} />, label: '모바일' },
                ]).map(({ key, icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreviewDevice(key)}
                    title={label}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "6px 12px",
                      border: "none",
                      borderRight: key !== 'mobile' ? "1px solid #e5e7eb" : "none",
                      background: previewDevice === key ? "#6366f1" : "#f9fafb",
                      color: previewDevice === key ? "#fff" : "#6b7280",
                      fontSize: 12, fontWeight: previewDevice === key ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {icon}
                    <span style={{ display: "none" }}>{label}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* 미리보기에서 바로 발행 버튼 */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setShowPreviewModal(false);
                    // form submit 이벤트 트리거
                    const form = document.getElementById("write-form") as HTMLFormElement | null;
                    if (form) form.requestSubmit();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 18px", borderRadius: 8,
                    background: isPending ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none", fontSize: 13, fontWeight: 700,
                    color: isPending ? "#6b7280" : "#fff",
                    cursor: isPending ? "not-allowed" : "pointer",
                    boxShadow: isPending ? "none" : "0 4px 14px rgba(99,102,241,0.4)",
                  }}
                >
                  {isPending
                    ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> {isEditMode ? "수정 중..." : "게시 중..."}</>
                    : <><PenSquare size={13} /> {isEditMode ? "발행" : "게시하기"}</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  style={{
                    background: "#f3f4f6", border: "none", borderRadius: 8,
                    width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "#6b7280",
                  }}
                ><X size={16} /></button>
              </div>
            </div>

            {/* HTML 소스 모드 안내 배너 */}
            {isHtmlSourceMode && htmlSource && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 20px",
                background: "#fffbeb",
                borderBottom: "1px solid #fde68a",
                fontSize: 12, color: "#92400e",
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                <div>
                  <strong>미리보기 제한 안내:</strong> HTML 원본 구조를 그대로 표현합니다.
                  단, <strong>외부 링크</strong>는 미리보기에서 클릭해도 이동되지 않으며,
                  <strong>JavaScript 기반 기능</strong>(슬라이더, 팝업 등)은 보안 정책상 일부 제한될 수 있습니다.
                  실제 발행 후에는 모든 기능이 정상 작동합니다.
                </div>
              </div>
            )}

            {/* 모달 본문 */}
            <div style={{ padding: isHtmlSourceMode && htmlSource ? "0" : "32px 40px", maxWidth: isHtmlSourceMode && htmlSource ? "none" : parseInt(siteConfigData?.postContentWidth || "960", 10), margin: "0 auto" }}>
              {/* 카테고리 배지 - HTML 소스 모드에서는 숨김 */}
              {selectedCat && !isHtmlSourceMode && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{
                    display: "inline-block",
                    background: selectedCat.color + "22",
                    color: selectedCat.color,
                    border: `1px solid ${selectedCat.color}44`,
                    borderRadius: 20, padding: "3px 12px",
                    fontSize: 12, fontWeight: 700,
                  }}>{selectedCat.label}</span>
                </div>
              )}

              {/* 제목 - HTML 소스 모드에서는 숨김 */}
              {!isHtmlSourceMode && (
                <h1 style={{
                  fontSize: 28, fontWeight: 900, color: "#111827",
                  lineHeight: 1.35, marginBottom: 16,
                }}>{title || "(제목 없음)"}</h1>
              )}

              {/* 메타 정보 - HTML 소스 모드에서는 숨김 */}
              {!isHtmlSourceMode && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  fontSize: 12, color: "#9ca3af",
                  marginBottom: 24, paddingBottom: 20,
                  borderBottom: "1px solid #e5e7eb",
                }}>
                  <span>오늘</span>
                  {excerpt && <span style={{ color: "#6b7280" }}>{excerpt}</span>}
                </div>
              )}

              {/* 썬네일 - HTML 소스 모드에서는 숨김 */}
              {thumbnail && !isHtmlSourceMode && (
                <div style={{ marginBottom: 28 }}>
                  <img
                    src={thumbnail}
                    alt="썸네일"
                    loading="lazy"
                    decoding="async"
                    style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 12 }}
                  />
                </div>
              )}

              {/* 본문 */}
              {isHtmlSourceMode && htmlSource ? (
                // HTML 소스 모드: 전체/부분 HTML 모두 BlobIframe으로 원본 구조 보존
                (() => {
                  // 부분 HTML인 경우 완전한 HTML 문서로 래핑
                  const isFullDoc = /^\s*(<!DOCTYPE|<html)/i.test(htmlSource.trim());
                  // 모바일/태블릿 모드에서는 viewport 메타를 모바일 기준으로 강제
                  const viewportMeta = previewDevice === 'mobile'
                    ? '<meta name="viewport" content="width=375,initial-scale=1">'
                    : previewDevice === 'tablet'
                    ? '<meta name="viewport" content="width=768,initial-scale=1">'
                    : '<meta name="viewport" content="width=device-width,initial-scale=1">';
                  const wrappedHtml = isFullDoc
                    ? htmlSource.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, viewportMeta)
                    : `<!DOCTYPE html><html><head><meta charset="utf-8">${viewportMeta}<style>
  html, body { margin: 0; padding: 0; box-sizing: border-box; }
  body { padding: 16px; font-family: 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-size: 16px; line-height: 1.8; color: #374151; background: #fff; word-break: keep-all; overflow-wrap: break-word; }
  *, *::before, *::after { box-sizing: border-box; }
  img, video, iframe, pre, table { max-width: 100%; height: auto; }
  p { margin-top: 0; margin-bottom: 0; }
  h1, h2, h3, h4, h5, h6 { margin-top: 0.5em; margin-bottom: 0.3em; }
  table { border-collapse: collapse; width: 100%; margin: 1.5em 0 2em; font-size: 15px; line-height: 1.6; color: #000; word-break: keep-all; }
  table th:not([style]) { background: #1e3a5f; color: #ffffff; font-weight: 700; padding: 11px 14px; border: 1px solid #1e3a5f; text-align: left; }
  table td:not([style]) { padding: 8px 12px; border: 1px solid #cbd5e1; vertical-align: top; min-width: 60px; }
  table tbody tr:not([style]):nth-child(odd) td:not([style]) { background-color: #f8fafc; }
  table tbody tr:not([style]):nth-child(even) td:not([style]) { background-color: #ffffff; }
  table thead th:not([style]) { background: #1e3a5f; color: #ffffff; border: 1px solid #1e3a5f; padding: 11px 14px; font-weight: 700; text-align: center; }
  ul { list-style-type: disc; padding-left: 2em; margin: 0.5em 0; }
  ol { list-style-type: decimal; padding-left: 2em; margin: 0.5em 0; }
  li { display: list-item; }
  img { max-width: 100%; height: auto; }
</style></head><body>${htmlSource}</body></html>`;
                  return <BlobIframe html={wrappedHtml} title="HTML 미리보기" />;
                })()
              ) : (
                <div
                  className="rich-preview"
                  style={{
                    maxWidth: parseInt(siteConfigData?.postContentWidth || "960", 10),
                    margin: "0 auto",
                  }}
                  dangerouslySetInnerHTML={{ __html: content }}
                />
              )}

              {/* 태그 - HTML 소스 모드에서는 숨김 */}
              {tags.length > 0 && !isHtmlSourceMode && (
                <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tags.map(t => (
                      <span key={t} style={{
                        display: "inline-block",
                        background: "#f0f0ff", border: "1px solid #c7d2fe",
                        borderRadius: 20, padding: "3px 12px",
                        fontSize: 12, color: "#4338ca", fontWeight: 600,
                      }}>#{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {/* 미리보기 하단 발행 버튼 영역 */}
              <div style={{
                marginTop: isHtmlSourceMode ? 0 : 40,
                padding: isHtmlSourceMode ? "16px 20px" : "24px 0 0",
                borderTop: "2px solid #e5e7eb",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
              }}>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  style={{
                    padding: "10px 24px", borderRadius: 8,
                    background: "#f3f4f6", border: "1px solid #e5e7eb",
                    fontSize: 13, fontWeight: 600, color: "#6b7280",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <X size={13} /> 닫기
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setShowPreviewModal(false);
                    const form = document.getElementById("write-form") as HTMLFormElement | null;
                    if (form) form.requestSubmit();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "10px 28px", borderRadius: 8,
                    background: isPending ? "#e5e7eb" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    border: "none", fontSize: 14, fontWeight: 700,
                    color: isPending ? "#6b7280" : "#fff",
                    cursor: isPending ? "not-allowed" : "pointer",
                    boxShadow: isPending ? "none" : "0 4px 20px rgba(99,102,241,0.45)",
                  }}
                >
                  {isPending
                    ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {isEditMode ? "수정 중..." : "게시 중..."}</>
                    : <><PenSquare size={14} /> {isEditMode ? "수정 발행" : "바로 게시하기"}</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 소셜 공유 팝업 */}
      {showShareDialog && publishedPostId && (
        <SocialShareDialog
          open={showShareDialog}
          onClose={() => {
            setShowShareDialog(false);
            // slug가 있으면 /p/:slug, 없으면 /post/:id
            // encodeURIComponent 제거: 브라우저가 자동으로 처리하며 이중 인코딩 방지
            if (publishedPostSlug) {
              navigate(`/p/${publishedPostSlug}`);
            } else {
              navigate(`/post/${publishedPostId}`);
            }
          }}
          postId={publishedPostId}
          slug={publishedPostSlug}
          title={title}
          description={excerpt || undefined}
          thumbnail={thumbnail || undefined}
          siteUrl={siteConfigData?.siteUrl || window.location.origin}
        />
      )}

      {/* 이탈 경고 AlertDialog */}
      <AlertDialog open={showLeaveWarning} onOpenChange={setShowLeaveWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              작성 중인 내용이 저장되지 않았습니다. 페이지를 떠나면 변경사항이 사라집니다.
              계속 진행하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { pendingNavigateRef.current = null; }}>
              계속 작성
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                // 자동저장 타이머 취소 - 취소 시 게시 상태 변경 방지
                if (autoSaveTimerRef.current) {
                  clearTimeout(autoSaveTimerRef.current);
                  autoSaveTimerRef.current = null;
                }
                setIsDirty(false);
                const action = pendingNavigateRef.current;
                pendingNavigateRef.current = null;
                action?.();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              페이지 떠나기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* HTML 소스 → 에디터 전환 경고 다이얼로그 */}
      {showHtmlToEditorWarning && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 440, width: "90%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 12 }}>
              ⚠️ HTML 에디터로 변환하면 구조가 변경됩니다
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.7, marginBottom: 24 }}>
              TipTap 에디터는 <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>&lt;style&gt;</code> 태그,
              그리드/플렉스 레이아웃, 복잡한 HTML 구조를 지원하지 않습니다.<br /><br />
              에디터로 전환하면 <strong style={{ color: "#e11d48" }}>HTML 소스의 레이아웃과 스타일이 손실</strong>될 수 있습니다.
              HTML 소스를 그대로 유지하려면 <strong>HTML 소스 탭</strong>에서 작업하세요.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowHtmlToEditorWarning(false)}
                style={{
                  padding: "9px 20px", borderRadius: 8, border: "1px solid #d1d5db",
                  background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                HTML 소스 유지
              </button>
              <button
                type="button"
                onClick={() => {
                  setContent(htmlSource);
                  setActiveTab("editor");
                  setShowHtmlToEditorWarning(false);
                }}
                style={{
                  padding: "9px 20px", borderRadius: 8, border: "none",
                  background: "#e11d48", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                에디터로 변환 (스타일 손실 가능)
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .post-content { color: #374151; font-size: 16px; line-height: 1.8; }
        .post-content p[style*="line-height"] { line-height: inherit !important; }
        .post-content h1[style*="line-height"] { line-height: inherit !important; }
        .post-content h2[style*="line-height"] { line-height: inherit !important; }
        .post-content h3[style*="line-height"] { line-height: inherit !important; }
        .post-content h4[style*="line-height"] { line-height: inherit !important; }
        .post-content h5[style*="line-height"] { line-height: inherit !important; }
        .post-content td[style*="line-height"] { line-height: inherit !important; }
        .post-content th[style*="line-height"] { line-height: inherit !important; }
        .post-content h1 { font-size: 2.2em !important; font-weight: 900; color: #111827; margin: 1.2em 0 0.5em; }
        .post-content h2 { font-size: 1.75em !important; font-weight: 800; color: #1f2937; margin: 1em 0 0.4em; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .post-content h3 { font-size: 1.4em !important; font-weight: 700; color: #374151; margin: 0.9em 0 0.3em; }
        .post-content h4 { font-size: 1.15em !important; font-weight: 700; color: #374151; margin: 0.8em 0 0.3em; }
        .post-content h5 { font-size: 1.0em !important; font-weight: 700; color: #374151; margin: 0.7em 0 0.2em; }
        .post-content p { margin: 0.5em 0; }
        .post-content p:empty { min-height: 1.2em; display: block; }
        .post-content p:has(> br:only-child) { min-height: 1.2em; }
        .post-content strong { color: inherit; font-weight: 800; }
        .post-content em { color: inherit; font-style: italic; }
        .post-content u { text-decoration: underline; }
        .post-content s { text-decoration: line-through; color: inherit; }
        .post-content code { background: #f3f4f6; color: #6366f1; padding: 2px 7px; border-radius: 4px; font-size: 0.88em; font-family: 'Fira Code', monospace; }
        .post-content pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 1.2em 0; }
        .post-content pre code { background: none; color: #6366f1; padding: 0; }
        .post-content blockquote { border-left: 4px solid #6366f1; padding: 10px 18px; margin: 1.2em 0; background: rgba(99,102,241,0.06); border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
        .post-content ul { padding-left: 1.6em; margin: 0.7em 0; list-style: disc; }
        .post-content ol { padding-left: 1.6em; margin: 0.7em 0; list-style: decimal; }
        .post-content li { margin: 0.3em 0; }
        .post-content a { color: #6366f1; text-decoration: underline; }
        .post-content img { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        .post-content img[data-align="left"] { margin-left: 0; margin-right: auto; }
        .post-content img[data-align="center"] { margin-left: auto; margin-right: auto; }
        .post-content img[data-align="right"] { margin-left: auto; margin-right: 0; }
        .post-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
        .post-content mark { background: rgba(254,240,138,0.5); color: #92400e; padding: 1px 4px; border-radius: 3px; }
        .post-content table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
        .post-content td, .post-content th { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; vertical-align: top; }
        .post-content th { background: #f3f4f6; font-weight: 700; color: #6366f1; }
        /* TipTap이 td/th 안에 <p> 태그를 생성하므로 margin/min-height 리셋 */
        .post-content td p, .post-content th p { margin: 0 !important; min-height: unset !important; }
        .post-content td p + p, .post-content th p + p { margin-top: 0.4em !important; }
        /* 자동 생성 목차 스타일 */
        .post-content .auto-toc { background: #f8f9ff; border: 2px solid #e0e7ff; border-left: 5px solid #6366f1; border-radius: 10px; padding: 20px 24px 16px; margin: 0 0 2em; }
        .post-content .auto-toc h2 { font-size: 1em !important; font-weight: 800 !important; color: #4f46e5 !important; margin: 0 0 12px !important; padding-bottom: 0 !important; border-bottom: none !important; }
        .post-content .auto-toc ol { padding-left: 1.4em !important; margin: 0 !important; list-style: decimal !important; }
        .post-content .auto-toc ol li { margin: 5px 0 !important; font-size: 0.93em; }
        .post-content .auto-toc ol li a { color: #4f46e5 !important; text-decoration: none !important; font-weight: 600; }
        .post-content .auto-toc ol li a:hover { color: #6366f1 !important; text-decoration: underline !important; }
        /* ─── HTML 소스 모드 전용 격리 ─── */
        /* all:initial 금지 - 브라우저 기본 스타일(table/h2/strong 등)까지 날아가 구조 붕괴 */
        .html-source-content {
          display: block;
          width: 100%;
          overflow-x: auto;
          box-sizing: border-box;
        }
        .html-source-content * {
          box-sizing: border-box;
        }
        /* 블로그 전역 CSS 차단: h1~h6 */
        .html-source-content h1,
        .html-source-content h2,
        .html-source-content h3,
        .html-source-content h4,
        .html-source-content h5,
        .html-source-content h6 { all: revert; box-sizing: border-box; }
        /* 블로그 전역 CSS 차단: p */
        .html-source-content p { all: revert; box-sizing: border-box; }
        /* 블로그 전역 CSS 차단: ul/ol/li */
        .html-source-content ul,
        .html-source-content ol,
        .html-source-content li { all: revert; box-sizing: border-box; }
        /* 블로그 전역 CSS 차단: table */
        .html-source-content table,
        .html-source-content thead,
        .html-source-content tbody,
        .html-source-content tr,
        .html-source-content th,
        .html-source-content td { all: revert; box-sizing: border-box; }
        /* 블로그 전역 CSS 차단: a */
        .html-source-content a { all: revert; box-sizing: border-box; }
        /* 블로그 전역 CSS 차단: strong/em/code/pre/blockquote */
        .html-source-content strong,
        .html-source-content em,
        .html-source-content code,
        .html-source-content pre,
        .html-source-content blockquote { all: revert; box-sizing: border-box; }
        .html-source-content img { max-width: 100%; height: auto; margin: 1em 0; display: block; }
        .html-source-content p > img { margin: 0; display: inline-block; }
        .html-source-content p:has(> img:only-child) { margin: 1em 0; text-align: center; }

        .rich-preview { color: #374151; font-size: 16px; line-height: 1.8; }
        .rich-preview h1 { font-size: 1.8em; font-weight: 900; color: #111827; margin: 1.2em 0 0.5em; }
        .rich-preview h2 { font-size: 1.4em; font-weight: 800; color: #1f2937; margin: 1em 0 0.4em; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .rich-preview h3 { font-size: 1.15em; font-weight: 700; color: #374151; margin: 0.9em 0 0.3em; }
        .rich-preview p { margin: 0.5em 0; }
        .rich-preview p:empty { min-height: 1.2em; display: block; }
        .rich-preview p:has(> br:only-child) { min-height: 1.2em; }
        .rich-preview strong { color: inherit; font-weight: 800; }
        .rich-preview em { color: inherit; font-style: italic; }
        .rich-preview code { background: #f3f4f6; color: #6366f1; padding: 2px 7px; border-radius: 4px; font-size: 0.88em; font-family: 'Fira Code', monospace; }
        .rich-preview pre { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; overflow-x: auto; margin: 1.2em 0; }
        .rich-preview pre code { background: none; color: #6366f1; padding: 0; }
        .rich-preview blockquote { border-left: 4px solid #6366f1; padding: 10px 18px; margin: 1.2em 0; background: rgba(99,102,241,0.06); border-radius: 0 8px 8px 0; color: #6b7280; font-style: italic; }
        .rich-preview ul { padding-left: 1.6em; margin: 0.7em 0; list-style: disc; }
        .rich-preview ol { padding-left: 1.6em; margin: 0.7em 0; list-style: decimal; }
        .rich-preview li { margin: 0.3em 0; }
        .rich-preview a { color: #6366f1; text-decoration: underline; }
        .rich-preview img { max-width: 100%; border-radius: 10px; margin: 1em 0; display: block; }
        /* p 태그 안의 img는 p의 margin이 여백을 담당하므로 img 자체 margin 제거 */
        .rich-preview p > img { margin-top: 0; margin-bottom: 0; }
        /* 이미지만 있는 p 태그: 이미지 중앙 정렬 */
        .rich-preview p:has(> img:only-child) { text-align: center; margin: 1em 0; }
        .rich-preview img[data-align="left"] { margin-left: 0; margin-right: auto; }
        .rich-preview img[data-align="center"] { margin-left: auto; margin-right: auto; }
        .rich-preview img[data-align="right"] { margin-left: auto; margin-right: 0; }
        .rich-preview hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
        .rich-preview mark { background: rgba(254,240,138,0.5); color: #92400e; padding: 1px 4px; border-radius: 3px; }
        .rich-preview table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
        .rich-preview td, .rich-preview th { border: 1px solid #e5e7eb; padding: 10px 14px; text-align: left; vertical-align: top; }
        .rich-preview th { background: #f3f4f6; font-weight: 700; color: #6366f1; }
        /* TipTap이 td/th 안에 <p> 태그를 생성하므로 margin/min-height 리셋 */
        .rich-preview td p, .rich-preview th p { margin: 0 !important; min-height: unset !important; }
        .rich-preview td p + p, .rich-preview th p + p { margin-top: 0.4em !important; }
        /* 자동 생성 목차 스타일 (rich-preview) */
        .rich-preview .auto-toc { background: #f8f9ff; border: 2px solid #e0e7ff; border-left: 5px solid #6366f1; border-radius: 10px; padding: 20px 24px 16px; margin: 0 0 2em; }
        .rich-preview .auto-toc h2 { font-size: 1em !important; font-weight: 800 !important; color: #4f46e5 !important; margin: 0 0 12px !important; padding-bottom: 0 !important; border-bottom: none !important; }
        .rich-preview .auto-toc ol { padding-left: 1.4em !important; margin: 0 !important; list-style: decimal !important; }
        .rich-preview .auto-toc ol li { margin: 5px 0 !important; font-size: 0.93em; }
        .rich-preview .auto-toc ol li a { color: #4f46e5 !important; text-decoration: none !important; font-weight: 600; }
        .rich-preview .auto-toc ol li a:hover { color: #6366f1 !important; text-decoration: underline !important; }
        /* html-embed 래퍼: 커스텀 HTML이 블로그 CSS와 충돌하지 않도록 간섭적 차단만 적용 */
        /* 주의: all:revert 미사용 - 인라인 스타일(display:grid 등)을 보존해야 함 */
        .post-content .html-embed, .rich-preview .html-embed { display: block; }
        /* 블로그 글자 색상/마진 오버라이드 차단 */
        .post-content .html-embed h1, .post-content .html-embed h2, .post-content .html-embed h3,
        .post-content .html-embed h4, .post-content .html-embed h5, .post-content .html-embed h6,
        .rich-preview .html-embed h1, .rich-preview .html-embed h2, .rich-preview .html-embed h3,
        .rich-preview .html-embed h4, .rich-preview .html-embed h5, .rich-preview .html-embed h6 {
          border-bottom: none !important;
          padding-bottom: unset;
          color: unset;
          font-size: unset;
          font-weight: unset;
          margin: unset;
        }
        .post-content .html-embed p, .rich-preview .html-embed p { margin: 0; min-height: unset; }
        .post-content .html-embed img, .rich-preview .html-embed img { border-radius: 0; margin: 0; }
        .post-content .html-embed ul, .rich-preview .html-embed ul { list-style: disc; padding-left: 1.5em; margin: 0; }
        .post-content .html-embed ol, .rich-preview .html-embed ol { list-style: decimal; padding-left: 1.5em; margin: 0; }
        .post-content .html-embed li, .rich-preview .html-embed li { margin: 0; }
        .post-content .html-embed a, .rich-preview .html-embed a { color: unset; text-decoration: unset; }
        .post-content .html-embed code, .rich-preview .html-embed code { background: none; color: unset; padding: 0; font-size: unset; }
        .post-content .html-embed strong, .rich-preview .html-embed strong { color: unset; }
        .post-content .html-embed em, .rich-preview .html-embed em { color: unset; }
        .post-content .html-embed span, .rich-preview .html-embed span { color: unset; }
      `}</style>
    </div>
  );
}
