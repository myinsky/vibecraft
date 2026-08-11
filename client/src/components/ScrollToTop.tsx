import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/**
 * 스크롤이 300px 이상 내려가면 우측 하단에 나타나는 "맨 위로 가기" 버튼.
 * SiteChatbot 버튼과 겹치지 않도록 bottom 위치를 조정.
 */
export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="맨 위로 가기"
      title="맨 위로 가기"
      className="
        fixed bottom-24 right-4 z-50
        w-10 h-10
        flex items-center justify-center
        rounded-full
        bg-white border border-gray-200
        shadow-md
        text-gray-600
        hover:bg-gray-50 hover:text-gray-900 hover:shadow-lg
        active:scale-95
        transition-all duration-200
        sm:bottom-8 sm:right-6
      "
    >
      <ChevronUp className="w-5 h-5" strokeWidth={2.5} />
    </button>
  );
}
