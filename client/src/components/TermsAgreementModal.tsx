/**
 * TermsAgreementModal
 * 로그인 후 아직 약관에 동의하지 않은 사용자에게 표시되는 필수 동의 모달.
 * - 이용약관 + 개인정보처리방침 체크박스 (각각 필수)
 * - 전체 동의 체크박스
 * - 동의 완료 시 auth.agreeToTerms 뮤테이션 호출 후 모달 닫힘
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function TermsAgreementModal() {
  const { user, loading, refresh } = useAuth();
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  const agreeToTermsMutation = trpc.auth.agreeToTerms.useMutation({
    onSuccess: () => {
      toast.success("약관 동의가 완료되었습니다.");
      refresh();
    },
    onError: () => {
      toast.error("처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
    },
  });

  // 로딩 중이거나 미로그인이거나 이미 동의한 경우 렌더링 안 함
  if (loading) return null;
  if (!user) return null;
  if ((user as any).agreedToTerms) return null;

  const allAgreed = agreedTerms && agreedPrivacy;

  const handleAgreeAll = (checked: boolean) => {
    setAgreedTerms(checked);
    setAgreedPrivacy(checked);
  };

  const handleSubmit = () => {
    if (!allAgreed) return;
    agreeToTermsMutation.mutate();
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        // 닫기 버튼 숨김 (필수 동의이므로 강제)
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="text-violet-600" size={22} />
            <DialogTitle className="text-lg font-bold">서비스 이용 약관 동의</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-500">
            Smart Auto Guide 서비스를 이용하시려면 아래 약관에 동의해 주세요.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 전체 동의 */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 border border-violet-100">
            <Checkbox
              id="agree-all"
              checked={agreedTerms && agreedPrivacy}
              onCheckedChange={(checked) => handleAgreeAll(Boolean(checked))}
            />
            <Label htmlFor="agree-all" className="font-semibold text-violet-700 cursor-pointer">
              전체 동의하기
            </Label>
          </div>

          <div className="space-y-3 pl-1">
            {/* 이용약관 */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree-terms"
                checked={agreedTerms}
                onCheckedChange={(checked) => setAgreedTerms(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="agree-terms" className="cursor-pointer text-sm font-medium">
                  이용약관 동의{" "}
                  <span className="text-red-500 font-semibold">(필수)</span>
                </Label>
                <div className="mt-1">
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:underline"
                  >
                    이용약관 전문 보기 →
                  </a>
                </div>
              </div>
            </div>

            {/* 개인정보처리방침 */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="agree-privacy"
                checked={agreedPrivacy}
                onCheckedChange={(checked) => setAgreedPrivacy(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="flex-1">
                <Label htmlFor="agree-privacy" className="cursor-pointer text-sm font-medium">
                  개인정보처리방침 동의{" "}
                  <span className="text-red-500 font-semibold">(필수)</span>
                </Label>
                <div className="mt-1">
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:underline"
                  >
                    개인정보처리방침 전문 보기 →
                  </a>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            동의하지 않으시면 서비스 이용이 제한될 수 있습니다.
            약관 내용은 서비스 내 정책 페이지에서 언제든지 확인하실 수 있습니다.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!allAgreed || agreeToTermsMutation.isPending}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white"
        >
          {agreeToTermsMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              처리 중...
            </>
          ) : (
            "동의하고 시작하기"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
