import { useEffect, useRef, useState } from "react";
import { makeSrcSet, CARD_SIZES } from "@/lib/imageUtils";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
  fetchPriority?: "high" | "low" | "auto";
  /** 히어로 이미지 등 즉시 로드가 필요한 경우 true */
  eager?: boolean;
  width?: number;
  height?: number;
  onError?: () => void;
}

/**
 * 이미지 지연 로딩 컴포넌트
 * - Intersection Observer로 뷰포트 진입 시 로드
 * - loading="lazy" 네이티브 속성 병행 적용
 * - blur-up 플레이스홀더 효과 (로드 전 회색 배경 → 로드 후 fade-in)
 * - srcset/sizes 자동 적용 (imageUtils.makeSrcSet 활용)
 */
export default function LazyImage({
  src,
  alt,
  className = "",
  style,
  sizes = CARD_SIZES,
  fetchPriority = "auto",
  eager = false,
  width,
  height,
  onError,
}: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(eager);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer: 뷰포트 200px 전에 미리 로드 시작
  useEffect(() => {
    if (eager) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  // 이미 캐시된 이미지는 즉시 loaded 처리
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [inView]);

  const handleLoad = () => setLoaded(true);
  const handleError = () => {
    setError(true);
    setLoaded(true);
    onError?.();
  };

  const srcSet = makeSrcSet(src);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={style}
    >
      {/* 플레이스홀더 배경 (로드 전) */}
      {!loaded && (
        <div
          className="absolute inset-0 bg-gray-200 animate-pulse"
          aria-hidden="true"
        />
      )}

      {/* 실제 이미지 */}
      {inView && !error && (
        <img
          ref={imgRef}
          src={src}
          srcSet={srcSet || undefined}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={fetchPriority}
          decoding="async"
          width={width}
          height={height}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {/* 이미지 로드 실패 시 폴백 */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <span className="text-gray-400 text-xs">이미지 없음</span>
        </div>
      )}
    </div>
  );
}
