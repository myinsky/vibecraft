// 바이브 코딩 & 자동화 프로그램 블로그 데이터

export interface Post {
  id: number;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  categoryColor: string;
  image: string;
  views?: number;
  likes?: number;
  readTime?: string;
  badge?: string;
  fileType?: string;
  fileSize?: string;
  downloads?: number;
  isPinned?: boolean;
  /** 커스텀 페이지인 경우 true */
  isCustomPage?: boolean;
  /** 커스텀 페이지 slug (이동 URL 생성용) */
  customPageSlug?: string;
  /** SEO 슬러그 */
  slug?: string;
  /** 커스텀 SEO 슬러그 */
  customSlug?: string;
}

export interface SidebarAd {
  id: number;
  title: string;
  description: string;
  bgColor: string;
  textColor: string;
  badge?: string;
  url: string;
  price?: string;
  btnText?: string;
  btnColor?: string;
}

export interface SidebarLink {
  label: string;
  url: string;
}

// 바이브 코딩 섹션 - AI 앱 만들기 (피처드 1 + 서브 4)
export const vibeCodingPosts: Post[] = [
  {
    id: 1,
    title: "코딩 없이 AI가 만드는 가장 쉬운 방법",
    excerpt: "Claude와 Cursor로 10분 만에 나만의 AI 앱을 만들어보세요. 초보자도 따라할 수 있는 단계별 가이드입니다.",
    date: "2026.05.08",
    category: "바이브 코딩",
    categoryColor: "#7c3aed",
    image: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&h=340&fit=crop",
    views: 12142,
    likes: 234,
    badge: "인기",
  },
  {
    id: 2,
    title: "유튜브 자막 시스템 구축 완벽 가이드",
    excerpt: "AI를 활용해 유튜브 자막을 자동으로 생성하고 번역하는 시스템을 만들어봅니다.",
    date: "2026.05.05",
    category: "자동화",
    categoryColor: "#0ea5e9",
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=220&fit=crop",
    views: 7437,
    likes: 156,
    badge: "NEW",
  },
  {
    id: 3,
    title: "ChatGPT로 업무용 AI 앱 TOP 10 만들기",
    excerpt: "실무에서 바로 쓸 수 있는 ChatGPT 기반 자동화 앱 10가지를 소개합니다.",
    date: "2026.05.03",
    category: "AI 앱",
    categoryColor: "#10b981",
    image: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=400&h=220&fit=crop",
    views: 9823,
    likes: 312,
    badge: "추천",
  },
  {
    id: 4,
    title: "AI 밴딩 자동 생성 완벽 가이드",
    excerpt: "AI로 브랜딩 이미지, 로고, 배너를 자동으로 생성하는 워크플로우를 구축합니다.",
    date: "2026.05.01",
    category: "디자인 자동화",
    categoryColor: "#f59e0b",
    image: "https://images.unsplash.com/photo-1558655146-d09347e92766?w=400&h=220&fit=crop",
    views: 5621,
    likes: 98,
  },
  {
    id: 5,
    title: "2026 최고의 AI 앱 TOP 10",
    excerpt: "올해 가장 주목받는 AI 생산성 앱 10가지를 직접 사용해보고 비교 분석했습니다.",
    date: "2026.04.28",
    category: "AI 추천",
    categoryColor: "#e11d48",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=220&fit=crop",
    views: 18234,
    likes: 445,
    badge: "BEST",
  },
];

// 최신 글 섹션
export const latestPosts: Post[] = [
  {
    id: 10,
    title: "제발 AI로 노트를 만드는 방법은 따라 하지 마세요",
    excerpt: "AI 노트 자동화의 함정과 진짜 생산성을 높이는 올바른 방법을 알려드립니다.",
    date: "2026.05.07",
    category: "바이브 코딩",
    categoryColor: "#7c3aed",
    image: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=400&h=220&fit=crop",
    views: 8432,
    likes: 201,
    readTime: "8분",
  },
  {
    id: 11,
    title: "ChatGPT API 자동화 앱 만들기 실전 설정 방법",
    excerpt: "ChatGPT API를 활용한 실전 자동화 앱 제작 가이드. 초보자도 따라할 수 있습니다.",
    date: "2026.05.06",
    category: "AI 앱",
    categoryColor: "#10b981",
    image: "https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=400&h=220&fit=crop",
    views: 6341,
    likes: 178,
    readTime: "12분",
  },
  {
    id: 12,
    title: "AI 자동화 워크플로우 구축 완벽 가이드",
    excerpt: "Make, Zapier, n8n을 활용한 AI 자동화 워크플로우 구축 방법을 단계별로 설명합니다.",
    date: "2026.05.05",
    category: "자동화",
    categoryColor: "#0ea5e9",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=220&fit=crop",
    views: 5892,
    likes: 143,
    readTime: "15분",
    badge: "SEO 87",
  },
  {
    id: 13,
    title: "초보자가 가장 먼저 만들어야 할 AI TOP 7",
    excerpt: "AI 개발 입문자를 위한 첫 번째 프로젝트 7가지. 실용적이고 빠르게 만들 수 있습니다.",
    date: "2026.05.04",
    category: "입문",
    categoryColor: "#f59e0b",
    image: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=400&h=220&fit=crop",
    views: 11203,
    likes: 287,
    readTime: "10분",
    badge: "SEO 92",
  },
];

// AI 툴 추천 섹션
export const toolPosts: Post[] = [
  {
    id: 20,
    title: "2026 최고의 AI 앱 무료 BEST 7",
    excerpt: "무료로 사용할 수 있는 최고의 AI 생산성 앱 7가지를 엄선했습니다.",
    date: "2026.05.06",
    category: "AI 추천",
    categoryColor: "#e11d48",
    image: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=220&fit=crop",
    views: 13845,
    likes: 334,
    badge: "TOP",
  },
  {
    id: 21,
    title: "AI 영상 제작 사이트 TOP 7",
    excerpt: "텍스트만 입력하면 영상이 완성되는 AI 영상 제작 플랫폼 비교 분석입니다.",
    date: "2026.05.04",
    category: "영상 AI",
    categoryColor: "#7c3aed",
    image: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&h=220&fit=crop",
    views: 9432,
    likes: 256,
  },
  {
    id: 22,
    title: "AI 음성 복제 200% 활용 추천 방법",
    excerpt: "ElevenLabs, Suno 등 AI 음성 도구를 200% 활용하는 실전 팁을 공유합니다.",
    date: "2026.05.02",
    category: "음성 AI",
    categoryColor: "#0ea5e9",
    image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&h=220&fit=crop",
    views: 7621,
    likes: 189,
  },
  {
    id: 23,
    title: "AI 영상 생성 사이트 추천 비교",
    excerpt: "2026년 가장 주목받는 AI 영상 생성 사이트를 직접 테스트하고 비교했습니다.",
    date: "2026.04.30",
    category: "영상 AI",
    categoryColor: "#7c3aed",
    image: "https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=400&h=220&fit=crop",
    views: 6234,
    likes: 145,
  },
  {
    id: 24,
    title: "Cursor AI 코딩 완전 정복 가이드",
    excerpt: "Cursor를 활용한 바이브 코딩 실전 가이드. 복잡한 앱도 코딩 없이 만들 수 있습니다.",
    date: "2026.04.28",
    category: "바이브 코딩",
    categoryColor: "#7c3aed",
    image: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=400&h=220&fit=crop",
    views: 15234,
    likes: 412,
    badge: "인기",
  },
];

// 자료실 섹션 (다운로드)
export const downloadPosts: Post[] = [
  {
    id: 30,
    title: "AI 앱 만들기 도구 모음 ZIP",
    excerpt: "바이브 코딩에 필요한 모든 도구와 템플릿을 한 번에 다운로드하세요.",
    date: "2026.05.07",
    category: "ZIP",
    categoryColor: "#f59e0b",
    image: "",
    fileType: "ZIP",
    fileSize: "24.3MB",
    downloads: 11248,
  },
  {
    id: 31,
    title: "AI 앱 제작 워크플로우 가이드 PDF",
    excerpt: "AI 앱 제작의 전체 워크플로우를 정리한 PDF 가이드 문서입니다.",
    date: "2026.06.18",
    category: "PDF",
    categoryColor: "#e11d48",
    image: "",
    fileType: "PDF",
    fileSize: "8.7MB",
    downloads: 8432,
  },
  {
    id: 32,
    title: "무료 자동화 CSV 데이터 템플릿",
    excerpt: "자동화 프로젝트에 바로 사용할 수 있는 CSV 데이터 템플릿 모음입니다.",
    date: "2026.05.17",
    category: "CSV",
    categoryColor: "#10b981",
    image: "",
    fileType: "CSV",
    fileSize: "1.2MB",
    downloads: 5621,
  },
  {
    id: 33,
    title: "AI 앱 만들기 JSON 설정 파일",
    excerpt: "ChatGPT, Claude API 연동에 필요한 JSON 설정 파일 모음입니다.",
    date: "2026.05.07",
    category: "JSON",
    categoryColor: "#0ea5e9",
    image: "",
    fileType: "JSON",
    fileSize: "0.8MB",
    downloads: 7832,
  },
  {
    id: 34,
    title: "ChatGPT 활용 프롬프트 모음 TXT",
    excerpt: "업무 자동화에 바로 사용할 수 있는 ChatGPT 프롬프트 500개 모음입니다.",
    date: "2026.05.07",
    category: "TXT",
    categoryColor: "#6366f1",
    image: "",
    fileType: "TXT",
    fileSize: "0.3MB",
    downloads: 19234,
  },
  {
    id: 35,
    title: "AI 영상 제작 템플릿 MP4",
    excerpt: "AI 영상 제작에 활용할 수 있는 인트로/아웃트로 템플릿 모음입니다.",
    date: "2026.05.04",
    category: "MP4",
    categoryColor: "#7c3aed",
    image: "",
    fileType: "MP4",
    fileSize: "156MB",
    downloads: 4123,
  },
  {
    id: 36,
    title: "AI 브랜딩 템플릿 PNG",
    excerpt: "Canva, Figma에서 바로 사용 가능한 AI 브랜딩 PNG 템플릿 50종입니다.",
    date: "2026.05.04",
    category: "PNG",
    categoryColor: "#ec4899",
    image: "",
    fileType: "PNG",
    fileSize: "45.2MB",
    downloads: 6891,
  },
  {
    id: 37,
    title: "AI 도구 비교표 XLSX",
    excerpt: "2026년 주요 AI 도구 100개를 기능별로 비교 정리한 엑셀 파일입니다.",
    date: "2026.05.04",
    category: "XLSX",
    categoryColor: "#10b981",
    image: "",
    fileType: "XLSX",
    fileSize: "2.1MB",
    downloads: 9341,
  },
  {
    id: 38,
    title: "AI 앱 만들기 가이드 MD",
    excerpt: "마크다운 형식으로 정리된 AI 앱 개발 가이드 문서입니다.",
    date: "2026.05.04",
    category: "MD",
    categoryColor: "#64748b",
    image: "",
    fileType: "MD",
    fileSize: "0.5MB",
    downloads: 3421,
  },
  {
    id: 39,
    title: "노코드 자동화 소스 ZIP",
    excerpt: "Make, Zapier, n8n 자동화 워크플로우 소스 파일 모음입니다.",
    date: "2026.05.04",
    category: "ZIP",
    categoryColor: "#f59e0b",
    image: "",
    fileType: "ZIP",
    fileSize: "18.6MB",
    downloads: 7234,
  },
];

// 왼쪽 사이드바 광고
export const leftSidebarAds: SidebarAd[] = [
  {
    id: 1,
    title: "쿠팡 파트너스",
    description: "AI 개발 장비 최저가",
    bgColor: "linear-gradient(135deg, #c2410c 0%, #ea580c 100%)",
    textColor: "#fff",
    url: "#",
    price: "₩ 29,500",
    btnText: "구매하기",
    btnColor: "#9a3412",
  },
  {
    id: 2,
    title: "바이브 코딩 템플릿",
    description: "AI 앱 시작 템플릿 무료 제공",
    bgColor: "linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)",
    textColor: "#a5b4fc",
    badge: "FREE",
    url: "#",
    btnText: "다운로드",
    btnColor: "#4f46e5",
  },
  {
    id: 9,
    title: "AI 수익화 강의",
    description: "월 100만원 AI 수익 만들기",
    bgColor: "linear-gradient(135deg, #064e3b 0%, #059669 100%)",
    textColor: "#a7f3d0",
    badge: "HOT",
    url: "#",
    btnText: "강의 보기",
    btnColor: "#047857",
  },
  {
    id: 10,
    title: "유튜브 자동화",
    description: "AI 유튜브 채널 자동화 가이드",
    bgColor: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)",
    textColor: "#fecaca",
    badge: "NEW",
    url: "#",
    btnText: "무료 보기",
    btnColor: "#b91c1c",
  },
];

// 오른쪽 사이드바 광고
export const rightSidebarAds: SidebarAd[] = [
  {
    id: 3,
    title: "쿠팡 파트너스",
    description: "AI 개발 장비 최저가",
    bgColor: "linear-gradient(135deg, #c2410c 0%, #ea580c 100%)",
    textColor: "#fff",
    url: "#",
    price: "₩ 29,500",
    btnText: "구매하기",
    btnColor: "#9a3412",
  },
  {
    id: 4,
    title: "유튜브 자동화",
    description: "AI 유튜브 채널 자동화 가이드",
    bgColor: "linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)",
    textColor: "#fca5a5",
    badge: "HOT",
    url: "#",
    btnText: "보러가기",
    btnColor: "#b91c1c",
  },
  {
    id: 11,
    title: "Cursor AI 강의",
    description: "바이브 코딩 입문 강의 무료",
    bgColor: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)",
    textColor: "#c7d2fe",
    badge: "FREE",
    url: "#",
    btnText: "무료 수강",
    btnColor: "#3730a3",
  },
  {
    id: 12,
    title: "AI 자동화 뉴스레터",
    description: "매주 AI 자동화 팁 무료 구독",
    bgColor: "linear-gradient(135deg, #134e4a 0%, #0d9488 100%)",
    textColor: "#ccfbf1",
    badge: "구독",
    url: "#",
    btnText: "무료 구독",
    btnColor: "#0f766e",
  },
];

// 왼쪽 사이드바 링크
export const leftSidebarLinks: SidebarLink[] = [
  { label: "바이브 코딩 입문", url: "#" },
  { label: "AI 앱 만들기", url: "#" },
  { label: "자동화 도구", url: "#" },
  { label: "프로그램 다운로드", url: "#" },
  { label: "개발 스토리", url: "#" },
  { label: "툴 추천", url: "#" },
];

// 오른쪽 사이드바 링크
export const rightSidebarLinks: SidebarLink[] = [
  { label: "Cursor AI", url: "#" },
  { label: "Claude API", url: "#" },
  { label: "ChatGPT API", url: "#" },
  { label: "Make 자동화", url: "#" },
  { label: "n8n 워크플로우", url: "#" },
  { label: "Zapier 연동", url: "#" },
];

// ===== 바이브코딩 앱 소개 =====

export interface AppReview {
  id: number;
  author: string;
  avatar: string;
  rating: number;
  content: string;
  date: string;
}

export interface VibeApp {
  id: number;
  name: string;
  tagline: string;
  description: string;
  category: string;
  categoryColor: string;
  badge?: string;
  image: string;
  icon: string;
  techStack: string[];
  features: string[];
  usageSteps: { step: number; title: string; desc: string }[];
  downloadUrl?: string;
  /** 앱 웹사이트 URL */
  appUrl?: string | null;
  /** 업로드 시 원본 파일명 (다운로드 시 Content-Disposition에 사용) */
  originalFilename?: string | null;
  demoUrl?: string;
  version: string;
  releaseDate: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  reviews: AppReview[];
}

export const vibeApps: VibeApp[] = [
  {
    id: 1,
    name: "AutoCaption AI",
    tagline: "유튜브 영상 자막을 1분 만에 자동 생성",
    description: "Whisper AI를 활용해 유튜브 영상의 자막을 자동으로 생성하고 한국어로 번역까지 해주는 자동화 프로그램입니다. 드래그 앤 드롭으로 영상 파일을 올리면 바로 SRT 파일이 완성됩니다.",
    category: "영상 자동화",
    categoryColor: "#7c3aed",
    badge: "인기",
    image: "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&h=340&fit=crop",
    icon: "🎬",
    techStack: ["Python", "Whisper AI", "FFmpeg", "Tkinter"],
    features: [
      "MP4, MOV, AVI 등 주요 영상 포맷 지원",
      "OpenAI Whisper 기반 고정밀 음성 인식",
      "한국어 자동 번역 (DeepL API 연동)",
      "SRT / VTT / TXT 형식으로 내보내기",
      "배치 처리로 여러 파일 동시 변환",
    ],
    usageSteps: [
      { step: 1, title: "프로그램 실행", desc: "다운로드한 AutoCaption.exe를 실행합니다. 별도 설치 없이 바로 실행 가능합니다." },
      { step: 2, title: "영상 파일 불러오기", desc: "영상 파일을 창에 드래그 앤 드롭하거나 '파일 열기' 버튼으로 불러옵니다." },
      { step: 3, title: "언어 및 출력 형식 선택", desc: "원본 언어와 번역 언어, SRT/VTT 등 출력 형식을 선택합니다." },
      { step: 4, title: "자막 생성 시작", desc: "'자막 생성' 버튼을 클릭하면 AI가 자동으로 자막을 생성합니다. 10분 영상 기준 약 1분 소요됩니다." },
      { step: 5, title: "결과 파일 저장", desc: "생성된 자막 파일을 원하는 위치에 저장하고 영상 편집 프로그램에서 불러옵니다." },
    ],
    downloadUrl: "#",
    demoUrl: "#",
    version: "v1.3.2",
    releaseDate: "2026.04.20",
    downloads: 8432,
    rating: 4.7,
    reviewCount: 124,
    reviews: [
      { id: 1, author: "김개발", avatar: "김", rating: 5, content: "유튜브 영상 자막 작업이 너무 힘들었는데 이 프로그램 덕분에 시간이 90% 줄었어요. 정확도도 높고 한국어 번역도 자연스럽습니다!", date: "2026.05.01" },
      { id: 2, author: "박자동화", avatar: "박", rating: 5, content: "배치 처리 기능이 정말 편리합니다. 영상 10개를 한 번에 처리할 수 있어서 채널 운영이 훨씬 수월해졌어요.", date: "2026.04.28" },
      { id: 3, author: "이유튜버", avatar: "이", rating: 4, content: "전반적으로 만족스럽습니다. 다만 영어 발음이 특이한 경우 인식률이 조금 떨어지는 편이에요. 업데이트 기대합니다.", date: "2026.04.25" },
    ],
  },
  {
    id: 2,
    name: "SheetBot Pro",
    tagline: "엑셀 반복 작업을 AI가 자동으로 처리",
    description: "매일 반복되는 엑셀 데이터 정리, 보고서 생성, 이메일 발송까지 자동화하는 노코드 RPA 프로그램입니다. 파이썬 코딩 없이 드래그 앤 드롭으로 자동화 흐름을 만들 수 있습니다.",
    category: "업무 자동화",
    categoryColor: "#10b981",
    badge: "NEW",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=340&fit=crop",
    icon: "📊",
    techStack: ["Python", "OpenPyXL", "Pandas", "PyAutoGUI"],
    features: [
      "드래그 앤 드롭 자동화 흐름 설계",
      "엑셀/CSV 데이터 자동 정리 및 분류",
      "조건부 이메일 자동 발송 (Outlook 연동)",
      "정기 실행 스케줄러 내장",
      "100가지 이상 사전 제작 템플릿 제공",
    ],
    usageSteps: [
      { step: 1, title: "설치 및 실행", desc: "SheetBot_Setup.exe를 실행해 설치합니다. Windows 10/11 환경에서 동작합니다." },
      { step: 2, title: "엑셀 파일 연결", desc: "자동화할 엑셀 파일을 프로그램에 연결합니다. 여러 파일을 동시에 연결할 수 있습니다." },
      { step: 3, title: "자동화 흐름 설계", desc: "좌측 액션 패널에서 원하는 동작을 드래그해 캔버스에 배치합니다. 조건 분기, 반복, 필터 등을 조합합니다." },
      { step: 4, title: "테스트 실행", desc: "'테스트' 버튼으로 소량의 데이터에 먼저 적용해 결과를 확인합니다." },
      { step: 5, title: "스케줄 등록", desc: "매일 오전 9시 등 원하는 시간에 자동 실행되도록 스케줄을 등록합니다." },
    ],
    downloadUrl: "#",
    demoUrl: "#",
    version: "v2.1.0",
    releaseDate: "2026.05.02",
    downloads: 5621,
    rating: 4.5,
    reviewCount: 87,
    reviews: [
      { id: 1, author: "최회계사", avatar: "최", rating: 5, content: "매달 3시간씩 걸리던 월말 보고서 작업이 이제 버튼 하나로 끝납니다. 정말 혁신적인 도구예요.", date: "2026.05.05" },
      { id: 2, author: "정마케터", avatar: "정", rating: 4, content: "템플릿이 다양해서 처음 사용하는 분도 쉽게 시작할 수 있어요. 이메일 자동화 기능이 특히 유용합니다.", date: "2026.05.03" },
    ],
  },
  {
    id: 3,
    name: "BlogWriter AI",
    tagline: "키워드 하나로 SEO 최적화 블로그 글 자동 작성",
    description: "키워드만 입력하면 SEO에 최적화된 블로그 포스팅을 자동으로 작성해주는 AI 글쓰기 도구입니다. 네이버/구글 상위 노출을 위한 구조로 글을 생성하고 워드프레스에 바로 발행할 수 있습니다.",
    category: "콘텐츠 자동화",
    categoryColor: "#0ea5e9",
    badge: "추천",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=600&h=340&fit=crop",
    icon: "✍️",
    techStack: ["Python", "Claude API", "WordPress REST API", "Tkinter"],
    features: [
      "키워드 기반 SEO 최적화 글 자동 생성",
      "네이버/구글 검색 의도 분석 후 구조화",
      "이미지 자동 검색 및 삽입 (Unsplash 연동)",
      "워드프레스 원클릭 발행",
      "글 톤앤매너 5가지 스타일 선택 가능",
    ],
    usageSteps: [
      { step: 1, title: "API 키 설정", desc: "Claude API 키를 설정 화면에 입력합니다. 최초 1회만 설정하면 됩니다." },
      { step: 2, title: "키워드 입력", desc: "메인 키워드와 관련 키워드를 입력합니다. 예: '바이브 코딩', 'AI 자동화', '노코드'" },
      { step: 3, title: "글 스타일 선택", desc: "정보성/리뷰/튜토리얼/비교/뉴스 중 원하는 글 스타일을 선택합니다." },
      { step: 4, title: "글 생성 및 편집", desc: "'글 생성' 버튼을 클릭하면 약 30초 내에 완성된 글이 나타납니다. 내장 에디터로 수정할 수 있습니다." },
      { step: 5, title: "워드프레스 발행", desc: "워드프레스 연동 설정 후 '발행' 버튼을 클릭하면 즉시 포스팅됩니다." },
    ],
    downloadUrl: "#",
    demoUrl: "#",
    version: "v1.0.5",
    releaseDate: "2026.04.15",
    downloads: 3892,
    rating: 4.8,
    reviewCount: 56,
    reviews: [
      { id: 1, author: "한블로거", avatar: "한", rating: 5, content: "하루에 글 5개씩 발행하는 게 이제 가능해졌어요. SEO 구조도 잘 잡혀 있어서 실제로 검색 유입이 늘었습니다.", date: "2026.04.30" },
      { id: 2, author: "오콘텐츠", avatar: "오", rating: 5, content: "워드프레스 자동 발행 기능이 정말 편리합니다. 글 퀄리티도 생각보다 훨씬 좋아요.", date: "2026.04.27" },
    ],
  },
  {
    id: 4,
    name: "PriceTracker",
    tagline: "쿠팡/네이버 가격 변동을 자동으로 모니터링",
    description: "관심 상품의 가격을 자동으로 모니터링하고 목표 가격에 도달하면 카카오톡/이메일로 알림을 보내주는 프로그램입니다. 쿠팡, 네이버쇼핑, 11번가를 지원합니다.",
    category: "쇼핑 자동화",
    categoryColor: "#f59e0b",
    image: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&h=340&fit=crop",
    icon: "🛒",
    techStack: ["Python", "Selenium", "BeautifulSoup", "Kakao API"],
    features: [
      "쿠팡/네이버쇼핑/11번가 가격 자동 수집",
      "목표 가격 도달 시 카카오톡 알림",
      "가격 변동 그래프 시각화",
      "최저가 달성 시점 예측 (AI 분석)",
      "여러 상품 동시 모니터링",
    ],
    usageSteps: [
      { step: 1, title: "상품 URL 등록", desc: "모니터링할 상품의 URL을 복사해 프로그램에 붙여넣습니다." },
      { step: 2, title: "목표 가격 설정", desc: "알림을 받고 싶은 목표 가격을 입력합니다." },
      { step: 3, title: "알림 수단 설정", desc: "카카오톡 또는 이메일 중 알림 받을 방법을 선택하고 연동합니다." },
      { step: 4, title: "모니터링 시작", desc: "'모니터링 시작' 버튼을 클릭하면 백그라운드에서 자동으로 가격을 체크합니다." },
      { step: 5, title: "알림 수신", desc: "목표 가격에 도달하면 즉시 알림이 발송됩니다. 가격 그래프도 앱에서 확인할 수 있습니다." },
    ],
    downloadUrl: "#",
    version: "v1.2.1",
    releaseDate: "2026.03.28",
    downloads: 6234,
    rating: 4.6,
    reviewCount: 93,
    reviews: [
      { id: 1, author: "구매왕", avatar: "구", rating: 5, content: "원하던 노트북을 목표가에 구매했어요! 카카오톡 알림이 바로 와서 놓치지 않았습니다.", date: "2026.04.20" },
      { id: 2, author: "절약러", avatar: "절", rating: 4, content: "여러 쇼핑몰을 동시에 모니터링할 수 있어서 편리합니다. 가격 그래프 기능도 유용해요.", date: "2026.04.15" },
    ],
  },
  {
    id: 5,
    name: "MeetingNote AI",
    tagline: "회의 녹음을 자동으로 요약 정리",
    description: "회의 녹음 파일을 업로드하면 AI가 핵심 내용을 자동으로 요약하고, 액션 아이템과 담당자를 추출해 정리해주는 회의록 자동화 도구입니다.",
    category: "업무 자동화",
    categoryColor: "#10b981",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=340&fit=crop",
    icon: "🎙️",
    techStack: ["Python", "Whisper AI", "Claude API", "Notion API"],
    features: [
      "MP3/MP4/WAV 녹음 파일 자동 변환",
      "핵심 내용 3줄 요약 생성",
      "액션 아이템 및 담당자 자동 추출",
      "Notion 페이지 자동 생성 및 저장",
      "참석자별 발언 시간 분석",
    ],
    usageSteps: [
      { step: 1, title: "녹음 파일 업로드", desc: "회의 녹음 파일(MP3, MP4, WAV)을 프로그램 창에 드래그하거나 파일 선택으로 불러옵니다." },
      { step: 2, title: "회의 정보 입력", desc: "회의 제목, 날짜, 참석자 이름을 입력합니다. 참석자 이름은 발언 분리에 활용됩니다." },
      { step: 3, title: "AI 분석 실행", desc: "'분석 시작' 버튼을 클릭합니다. 1시간 회의 기준 약 3분 내에 결과가 나옵니다." },
      { step: 4, title: "결과 확인 및 편집", desc: "요약, 액션 아이템, 전체 스크립트 탭에서 결과를 확인하고 필요한 부분을 수정합니다." },
      { step: 5, title: "Notion 저장 또는 내보내기", desc: "Notion에 자동 저장하거나 PDF/Word 파일로 내보낼 수 있습니다." },
    ],
    downloadUrl: "#",
    demoUrl: "#",
    version: "v1.1.0",
    releaseDate: "2026.04.10",
    downloads: 4127,
    rating: 4.9,
    reviewCount: 41,
    reviews: [
      { id: 1, author: "팀장A", avatar: "팀", rating: 5, content: "회의록 작성에 매번 30분씩 썼는데 이제 3분이면 끝납니다. 액션 아이템 추출 정확도가 특히 놀랍습니다.", date: "2026.04.25" },
      { id: 2, author: "스타트업B", avatar: "스", rating: 5, content: "Notion 연동이 완벽합니다. 회의가 끝나면 자동으로 팀 페이지에 올라오니 공유도 편해요.", date: "2026.04.22" },
    ],
  },
];
