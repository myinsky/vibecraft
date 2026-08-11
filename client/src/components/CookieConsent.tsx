import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Cookie, X, Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE_CONSENT_KEY = "cookie_consent_status";
const COOKIE_CONSENT_DATE_KEY = "cookie_consent_date";

type ConsentStatus = "accepted" | "rejected" | null;

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    // 이미 동의/거부한 경우 표시 안 함
    const status = localStorage.getItem(COOKIE_CONSENT_KEY) as ConsentStatus;
    if (!status) {
      // 약간의 딜레이 후 표시 (페이지 로딩 후 자연스럽게)
      const timer = setTimeout(() => {
        setVisible(true);
        setAnimating(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    localStorage.setItem(COOKIE_CONSENT_DATE_KEY, new Date().toISOString());
    dismiss();
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    localStorage.setItem(COOKIE_CONSENT_DATE_KEY, new Date().toISOString());
    dismiss();
  };

  const dismiss = () => {
    setAnimating(false);
    setTimeout(() => setVisible(false), 400);
  };

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[9999] transition-transform duration-400 ease-in-out ${
        animating ? "translate-y-0" : "translate-y-full"
      }`}
      role="dialog"
      aria-label="쿠키 사용 동의"
      aria-modal="false"
    >
      {/* 배경 오버레이 (모바일에서 배너 위 영역 클릭 방지 없음 - 배너만 표시) */}
      <div className="bg-white border-t-2 border-indigo-200 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 16px" }}>
          {/* 기본 배너 */}
          <div className="py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* 아이콘 + 텍스트 */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                <Cookie className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 mb-0.5">
                  쿠키 사용 안내
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  이 사이트는 로그인 상태 유지, 방문 통계 분석, 맞춤형 서비스 제공을 위해 쿠키를 사용합니다.{" "}
                  <Link
                    href="/privacy"
                    className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800 font-medium"
                  >
                    개인정보처리방침
                  </Link>
                  에서 자세한 내용을 확인하세요.
                </p>
                {/* 상세 설명 (토글) */}
                {showDetail && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 font-bold mt-0.5">✓</span>
                      <span><strong className="text-gray-800">필수 쿠키</strong> — 로그인 세션 유지, 보안 등 서비스 운영에 필수적입니다. 거부할 수 없습니다.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-bold mt-0.5">○</span>
                      <span><strong className="text-gray-800">분석 쿠키</strong> — 방문자 수, 페이지 조회 등 통계 수집에 사용됩니다. 거부 시 통계 수집이 제외됩니다.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-orange-500 font-bold mt-0.5">○</span>
                      <span><strong className="text-gray-800">광고 쿠키</strong> — 구글 애드센스 등 광고 서비스에 사용됩니다. 거부 시 비개인화 광고가 표시됩니다.</span>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowDetail(!showDetail)}
                  className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  {showDetail ? "간략히 보기" : "쿠키 상세 설명 보기"}
                </button>
              </div>
            </div>

            {/* 버튼 그룹 */}
            <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReject}
                className="flex-1 sm:flex-none text-xs border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-gray-800 h-9 px-4"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                거부
              </Button>
              <Button
                size="sm"
                onClick={handleAccept}
                className="flex-1 sm:flex-none text-xs bg-indigo-600 hover:bg-indigo-700 text-white h-9 px-5 font-semibold shadow-sm"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                모두 동의
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 쿠키 동의 상태 확인 유틸리티
 * 다른 컴포넌트에서 import하여 사용 가능
 */
export function getCookieConsentStatus(): ConsentStatus {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(COOKIE_CONSENT_KEY) as ConsentStatus;
}

export function isCookieAccepted(): boolean {
  return getCookieConsentStatus() === "accepted";
}
