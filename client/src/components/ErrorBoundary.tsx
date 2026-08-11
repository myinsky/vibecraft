import { cn } from "@/lib/utils";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  forceReloading: boolean;
}

/**
 * lazy import 실패(네트워크 순단 또는 배포 후 청크 불일치) 여부 판별
 */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("ChunkLoadError") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

const RELOAD_FLAG_KEY = "chunk_error_hard_reload";

// lucide 아이콘을 SVG 인라인으로 교체 — ErrorBoundary는 초기 번들에 포함되므로
// lucide 청크(54KB)를 초기 로드에서 제거하여 TBT 개선
function SpinIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function WarningIcon({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function RefreshIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

class ErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0, forceReloading: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);

    if (isChunkLoadError(error)) {
      if (this.state.retryCount < 2) {
        // 1.5초 후 자동 재시도 (최대 2회)
        this.retryTimer = setTimeout(() => {
          this.setState((prev) => ({
            hasError: false,
            error: null,
            retryCount: prev.retryCount + 1,
          }));
        }, 1500);
      } else {
        // 2회 재시도 후에도 실패 → 새 배포로 인한 청크 불일치 가능성 높음
        // sessionStorage로 무한 루프 방지 (탭 세션당 1회만 강제 새로고침)
        const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG_KEY);
        if (!alreadyReloaded) {
          sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
          this.setState({ forceReloading: true });
          // 캐시 무효화 강제 새로고침
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          // 강제 새로고침 후에도 실패 → 플래그 제거 후 오류 화면 표시
          sessionStorage.removeItem(RELOAD_FLAG_KEY);
        }
      }
    }
  }

  componentDidMount() {
    // 강제 새로고침 후 정상 로드 시 플래그 제거
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      const isChunkErr = isChunkLoadError(this.state.error);

      // lazy chunk 에러이고 자동 재시도 중이면 스피너 표시
      if (isChunkErr && (this.state.retryCount < 2 || this.state.forceReloading)) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="flex flex-col items-center gap-3">
              <SpinIcon className="text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                {this.state.forceReloading
                  ? "새 버전을 불러오는 중..."
                  : "페이지를 다시 불러오는 중..."}
              </p>
            </div>
          </div>
        );
      }

      const rawMsg = this.state.error?.message || "알 수 없는 오류가 발생했습니다.";
      const safeMsg = rawMsg.replace(/data:[^;]+;base64,[^\s"']+/g, "[이미지 데이터]").slice(0, 200);

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-lg p-8">
            <WarningIcon
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-2 font-semibold">페이지를 불러오는 중 오류가 발생했습니다.</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              잠시 후 다시 시도하거나, 페이지를 새로고침해 주세요.
            </p>

            {safeMsg && (
              <div className="p-3 w-full rounded bg-muted overflow-auto mb-6 max-h-32">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                  {safeMsg}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RefreshIcon size={16} />
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
