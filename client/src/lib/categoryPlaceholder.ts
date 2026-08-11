/**
 * 카테고리 키 또는 카테고리 이름에 따라 썸네일 플레이스홀더 스타일을 반환합니다.
 * 썸네일이 없는 글 카드에 카테고리 성격에 맞는 배경색, 그라데이션, 아이콘을 표시합니다.
 */

export interface CategoryPlaceholder {
  gradient: string;   // CSS linear-gradient 값
  icon: string;       // 이모지 아이콘
  iconSize: number;   // 아이콘 폰트 크기 (px)
  label?: string;     // 선택적 텍스트 레이블
}

/** 카테고리 키/이름 → 플레이스홀더 매핑 */
const CATEGORY_MAP: Record<string, CategoryPlaceholder> = {
  // AI 앱 만들기 / 바이브 코딩
  "ai-apps":        { gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", icon: "🤖", iconSize: 48 },
  "vibe-coding":    { gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", icon: "⚡", iconSize: 48 },
  "바이브 코딩":    { gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", icon: "⚡", iconSize: 48 },
  "ai-coding":      { gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", icon: "💻", iconSize: 48 },

  // 자동화
  "automation":     { gradient: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)", icon: "⚙️", iconSize: 48 },
  "자동화":         { gradient: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)", icon: "⚙️", iconSize: 48 },
  "진행중인 자동화 프로그램": { gradient: "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)", icon: "🔄", iconSize: 48 },

  // AI 앱
  "ai-app":         { gradient: "linear-gradient(135deg, #10b981 0%, #34d399 100%)", icon: "🚀", iconSize: 48 },
  "ai-tools":       { gradient: "linear-gradient(135deg, #e11d48 0%, #fb7185 100%)", icon: "🛠️", iconSize: 48 },
  "AI 앱":          { gradient: "linear-gradient(135deg, #10b981 0%, #34d399 100%)", icon: "🚀", iconSize: 48 },
  "AI 추천":        { gradient: "linear-gradient(135deg, #e11d48 0%, #fb7185 100%)", icon: "⭐", iconSize: 48 },
  "AI 툴 추천":     { gradient: "linear-gradient(135deg, #e11d48 0%, #fb7185 100%)", icon: "🛠️", iconSize: 48 },

  // 디자인
  "design":         { gradient: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", icon: "🎨", iconSize: 48 },
  "디자인 자동화":  { gradient: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)", icon: "🎨", iconSize: 48 },

  // 영상/음성 AI
  "video-ai":       { gradient: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)", icon: "🎬", iconSize: 48 },
  "영상 AI":        { gradient: "linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)", icon: "🎬", iconSize: 48 },
  "audio-ai":       { gradient: "linear-gradient(135deg, #0ea5e9 0%, #67e8f9 100%)", icon: "🎙️", iconSize: 48 },
  "음성 AI":        { gradient: "linear-gradient(135deg, #0ea5e9 0%, #67e8f9 100%)", icon: "🎙️", iconSize: 48 },

  // 입문/튜토리얼
  "beginner":       { gradient: "linear-gradient(135deg, #f59e0b 0%, #fde68a 100%)", icon: "📚", iconSize: 48 },
  "입문":           { gradient: "linear-gradient(135deg, #f59e0b 0%, #fde68a 100%)", icon: "📚", iconSize: 48 },
  "tutorial":       { gradient: "linear-gradient(135deg, #f59e0b 0%, #fde68a 100%)", icon: "📖", iconSize: 48 },

  // 최신 글 / 기본
  "latest":         { gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", icon: "✨", iconSize: 48 },
  "news":           { gradient: "linear-gradient(135deg, #6366f1 0%, #a5b4fc 100%)", icon: "📰", iconSize: 48 },
};

/** 기본 플레이스홀더 (매핑 없을 때) */
const DEFAULT_PLACEHOLDER: CategoryPlaceholder = {
  gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
  icon: "📝",
  iconSize: 48,
};

/**
 * 카테고리 키 또는 이름으로 플레이스홀더 정보를 반환합니다.
 * 대소문자 무시, 공백 trim 처리.
 */
export function getCategoryPlaceholder(category?: string | null): CategoryPlaceholder {
  if (!category) return DEFAULT_PLACEHOLDER;

  const normalized = category.trim().toLowerCase();

  // 정확히 일치하는 키 먼저
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (key.toLowerCase() === normalized) return val;
  }

  // 부분 포함 매칭
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return val;
    }
  }

  return DEFAULT_PLACEHOLDER;
}
