/**
 * StatBannerSection - 스탯 배너 섹션 컴포넌트
 *
 * 두 가지 모드:
 *  - split (3칸 분리): 3개 카드 각각 독립 링크
 *  - single (1칸 통합): 전체 배너를 하나의 링크로 감쌈
 *
 * 각 카드는 3줄 텍스트(line1/line2/line3), 글자크기/굵기/색상/폰트/정렬,
 * 배경색(bgColor), 배경이미지(bgImage), 아이콘 이미지(imageUrl), 링크(linkUrl)를 지원합니다.
 * 섹션 전체 상하 여백은 paddingTop/paddingBottom, 다음 섹션 여백은 marginBottom으로 조정합니다.
 * cardRadius로 카드 테두리 둥글기를 조정합니다.
 * 상단 제목/부제목은 titleFontSize/titleColor/subtitleFontSize/subtitleColor로 스타일 조정,
 * 미입력 시 해당 줄은 렌더링하지 않습니다.
 * 이전 mainText/subText 포맷도 하위 호환됩니다.
 */
import { Link } from "wouter";

export interface StatBannerCard {
  // 3줄 텍스트
  line1?: string;
  line2?: string;
  line3?: string;
  line1Size?: number;
  line2Size?: number;
  line3Size?: number;
  // 굵기
  line1Weight?: string;
  line2Weight?: string;
  line3Weight?: string;
  // 색상
  line1Color?: string;
  line2Color?: string;
  line3Color?: string;
  // 폰트
  line1Font?: string;
  line2Font?: string;
  line3Font?: string;
  // 텍스트 정렬
  textAlign?: "left" | "center" | "right";
  // 하위 호환 (이전 mainText/subText 포맷)
  mainText?: string;
  subText?: string;
  bgColor?: string;
  bgImage?: string;
  linkUrl?: string;
  imageUrl?: string;
}

export interface StatBannerConfig {
  mode?: "split" | "single";
  singleLink?: string;
  paddingTop?: number;
  paddingBottom?: number;
  marginBottom?: number;
  cardRadius?: number;
  sectionRadius?: number;
  // 상단 제목/부제목 스타일
  titleFontSize?: number;
  titleColor?: string;
  subtitleFontSize?: number;
  subtitleColor?: string;
  cards?: StatBannerCard[];
}

interface StatBannerSectionProps {
  title?: string;
  subtitle?: string;
  cards?: StatBannerCard[];
  config?: StatBannerConfig;
  outerBgColor?: string;
}

const DEFAULT_CARDS: StatBannerCard[] = [
  { line1: "5배", line2: "투자수익률(ROI)", line1Size: 48, line2Size: 15, bgColor: "#2a2f45", textAlign: "left" },
  { line1: "20+", line2: "절약된 시간", line1Size: 48, line2Size: 15, bgColor: "#2a2f45", textAlign: "left" },
  { line1: "70%", line2: "CPI 감소", line1Size: 48, line2Size: 15, bgColor: "#2a2f45", textAlign: "left" },
];

function CardContent({
  card,
  isClickable,
  cardRadius,
}: {
  card: StatBannerCard;
  isClickable: boolean;
  cardRadius: number;
}) {
  const line1 = card.line1 ?? card.mainText ?? "";
  const line2 = card.line2 ?? card.subText ?? "";
  const line3 = card.line3 ?? "";
  const line1Size = Number(card.line1Size ?? 48);
  const line2Size = Number(card.line2Size ?? 15);
  const line3Size = Number(card.line3Size ?? 13);
  const textAlign = card.textAlign ?? "left";

  const bgStyle: React.CSSProperties = card.bgImage
    ? {
        backgroundImage: `url(${card.bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: card.bgColor || "#2a2f45",
      }
    : { background: card.bgColor || "#2a2f45" };

  return (
    <div
      style={{
        ...bgStyle,
        borderRadius: cardRadius,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start",
        textAlign,
        minHeight: 130,
        cursor: isClickable ? "pointer" : "default",
        transition: "transform 0.15s, box-shadow 0.15s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.06)",
        height: "100%",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.25)";
      }}
    >
      {/* 배경 이미지가 있을 때 어두운 오버레이로 텍스트 가독성 확보 */}
      {card.bgImage && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", borderRadius: cardRadius, zIndex: 0,
        }} />
      )}

      {/* 콘텐츠 (z-index로 오버레이 위에 표시) */}
      <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt={line1 || line2}
            loading="lazy"
            decoding="async"
            style={{
              width: "100%", height: 80, objectFit: "contain", marginBottom: 10,
              display: "block",
              marginLeft: textAlign === "center" ? "auto" : textAlign === "right" ? "auto" : 0,
              marginRight: textAlign === "center" ? "auto" : 0,
            }}
          />
        )}
        {line1 && (
          <span style={{
            fontSize: line1Size,
            fontWeight: card.line1Weight ? Number(card.line1Weight) : 900,
            color: card.line1Color || "#5ba3f5",
            lineHeight: 1.1,
            letterSpacing: "-1px",
            display: "block",
            marginBottom: line2 || line3 ? 6 : 0,
            fontFamily: card.line1Font || "'Noto Sans KR', sans-serif",
          }}>
            {line1}
          </span>
        )}
        {line2 && (
          <span style={{
            fontSize: line2Size,
            fontWeight: card.line2Weight ? Number(card.line2Weight) : 600,
            color: card.line2Color || "#cbd5e1",
            lineHeight: 1.4,
            display: "block",
            marginBottom: line3 ? 4 : 0,
            fontFamily: card.line2Font || undefined,
          }}>
            {line2}
          </span>
        )}
        {line3 && (
          <span style={{
            fontSize: line3Size,
            fontWeight: card.line3Weight ? Number(card.line3Weight) : 400,
            color: card.line3Color || "#94a3b8",
            lineHeight: 1.4,
            display: "block",
            fontFamily: card.line3Font || undefined,
          }}>
            {line3}
          </span>
        )}
      </div>
    </div>
  );
}

function WrapLink({ url, children }: { url: string; children: React.ReactNode }) {
  if (!url) return <>{children}</>;
  const isExternal = url.startsWith("http");
  if (isExternal) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "block" }}>
        {children}
      </a>
    );
  }
  return (
    <Link href={url} style={{ textDecoration: "none", display: "block" }}>
      {children}
    </Link>
  );
}

export default function StatBannerSection({
  title,
  subtitle,
  cards: legacyCards,
  config,
  outerBgColor = "#1a1f35",
}: StatBannerSectionProps) {
  const mode = config?.mode ?? "split";
  const singleLink = config?.singleLink ?? "";
  const paddingTop = config?.paddingTop ?? 32;
  const paddingBottom = config?.paddingBottom ?? 32;
  const marginBottomVal = config?.marginBottom ?? 0;
  const cardRadius = config?.cardRadius ?? 12;
  const sectionRadius = config?.sectionRadius ?? 0;

  // 상단 제목/부제목 스타일
  const titleFontSize = config?.titleFontSize ?? 22;
  const titleColor = config?.titleColor ?? "#e2e8f0";
  const subtitleFontSize = config?.subtitleFontSize ?? 14;
  const subtitleColor = config?.subtitleColor ?? "#94a3b8";

  const rawCards = config?.cards ?? legacyCards ?? [];
  const displayCards = rawCards.length > 0 ? rawCards : DEFAULT_CARDS;
  const cards3 = displayCards.slice(0, 3);

  // 제목/부제목: 미입력 시 해당 줄 숨김
  const showTitle = !!(title && title.trim());
  const showSubtitle = !!(subtitle && subtitle.trim());
  const showHeader = showTitle || showSubtitle;

  const grid = (
    <div
      className="stat-banner-grid"
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: `repeat(${Math.min(cards3.length, 3)}, 1fr)`,
        gap: 16,
      }}
    >
      {cards3.map((card, idx) => {
        if (mode === "split") {
          return (
            <WrapLink key={idx} url={card.linkUrl ?? ""}>
              <CardContent card={card} isClickable={!!card.linkUrl} cardRadius={cardRadius} />
            </WrapLink>
          );
        }
        return <CardContent key={idx} card={card} isClickable={!!singleLink} cardRadius={cardRadius} />;
      })}
    </div>
  );

  return (
    <section
      style={{
        background: outerBgColor,
        paddingTop,
        paddingBottom,
        paddingLeft: 20,
        paddingRight: 20,
        marginBottom: marginBottomVal,
        width: "100%",
        boxSizing: "border-box",
        borderRadius: sectionRadius,
        overflow: sectionRadius > 0 ? "hidden" : undefined,
      }}
    >
      {/* 상단 제목/부제목 — 미입력 시 해당 줄만 숨김, 둘 다 없으면 헤더 영역 전체 숨김 */}
      {showHeader && (
        <div style={{ maxWidth: 1200, margin: "0 auto 24px", textAlign: "center" }}>
          {showTitle && (
            <h2 style={{ fontSize: titleFontSize, fontWeight: 700, color: titleColor, margin: showSubtitle ? "0 0 6px" : "0" }}>
              {title}
            </h2>
          )}
          {showSubtitle && (
            <p style={{ fontSize: subtitleFontSize, color: subtitleColor, margin: 0 }}>{subtitle}</p>
          )}
        </div>
      )}

      {mode === "single" && singleLink ? (
        <WrapLink url={singleLink}>{grid}</WrapLink>
      ) : (
        grid
      )}

      <style>{`
        @media (max-width: 640px) {
          .stat-banner-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
          .stat-banner-grid > * { min-height: 90px !important; }
        }
        @media (max-width: 900px) and (min-width: 641px) {
          .stat-banner-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </section>
  );
}
