/**
 * ContactPage (/contact)
 * 방문자가 문의를 보낼 수 있는 폼 페이지.
 * - 이름, 이메일, 문의 유형, 내용 입력
 * - 이용약관 + 개인정보처리방침 동의 체크박스 (각각 필수)
 * - 제출 시 관리자에게 알림 발송 (notifyOwner)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, CheckCircle2, Mail, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "wouter";

const INQUIRY_TYPES = [
  { value: "general", label: "일반 문의" },
  { value: "ad", label: "광고 문의" },
  { value: "partnership", label: "제휴 문의" },
  { value: "bug", label: "오류 신고" },
  { value: "other", label: "기타" },
];

export default function ContactPage() {
  const { data: config } = trpc.admin.getSiteConfig.useQuery(undefined, { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false });
  const submitContact = trpc.contact.submit.useMutation();

  useSEO({
    title: `문의하기 | ${config?.siteTitle ?? "Smart Auto Guide"}`,
    description: "Smart Auto Guide에 문의 사항을 보내주세요.",
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    inquiryType: "general",
    message: "",
    subject: "",
  });
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);
  const [receiptNo, setReceiptNo] = useState<string>("");

  const allAgreed = agreedTerms && agreedPrivacy;
  const isValid =
    form.name.trim() &&
    form.email.trim() &&
    form.message.trim() &&
    allAgreed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    try {
      const inquiryLabel =
        INQUIRY_TYPES.find((t) => t.value === form.inquiryType)?.label ?? form.inquiryType;
      await submitContact.mutateAsync({
        name: form.name,
        email: form.email,
        subject: `${inquiryLabel} - ${form.name}`,
        message: form.message,
      });
      const now = new Date();
      const receipt = `VCX-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
      setSubmittedAt(now);
      setReceiptNo(receipt);
      setSubmitted(true);
      toast.success("문의가 성공적으로 접수되었습니다!", {
        description: `접수번호: ${receipt}`,
        duration: 5000,
      });
    } catch {
      toast.error("문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const contactEmail = config?.contactEmail;
  const operatingHours = config?.operatingHours;

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "#0a0a14" }}>
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="w-full max-w-md">
            {/* 성공 카드 */}
            <div
              className="rounded-2xl border border-green-500/30 bg-green-500/5 p-8 text-center"
              style={{ boxShadow: "0 0 40px rgba(34,197,94,0.08)" }}
            >
              {/* 아이콘 */}
              <div className="flex justify-center mb-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                  <div className="relative w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="text-green-400" size={36} />
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">문의가 접수되었습니다!</h2>
              <p className="text-gray-400 text-sm mb-6">
                소중한 문의 감사합니다. 빠른 시일 내에 답변 드리겠습니다.
              </p>

              {/* 접수 정보 */}
              <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-6 text-left space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
                  <span className="text-gray-400">접수번호</span>
                  <span className="ml-auto font-mono text-green-400 font-semibold text-xs">{receiptNo}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-violet-400 flex-shrink-0" />
                  <span className="text-gray-400">답변 이메일</span>
                  <span className="ml-auto text-white text-xs truncate max-w-[160px]">{form.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={14} className="text-blue-400 flex-shrink-0" />
                  <span className="text-gray-400">접수 시각</span>
                  <span className="ml-auto text-gray-300 text-xs">
                    {submittedAt?.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* 안내 문구 */}
              <p className="text-xs text-gray-500 mb-6">
                영업일 기준 <span className="text-violet-400 font-semibold">1~3일 이내</span> 이메일로 답변 드립니다.
                스팸 폴더도 확인해 주세요.
              </p>

              {/* 버튼 */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-gray-300 hover:bg-white/5"
                  onClick={() => {
                    setSubmitted(false);
                    setForm({ name: "", email: "", inquiryType: "general", message: "", subject: "" });
                    setAgreedTerms(false);
                    setAgreedPrivacy(false);
                  }}
                >
                  새 문의 작성
                </Button>
                <Link href="/">
                  <Button className="flex-1 bg-violet-600 hover:bg-violet-700 text-white w-full">
                    <ArrowLeft size={14} className="mr-1" />
                    홈으로 돌아가기
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0a0a14" }}>
      <Header />
      <main className="flex-1 py-12 px-4">
        <div className="max-w-xl mx-auto">
          {/* 페이지 헤더 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">문의하기</h1>
            <p className="text-gray-400 text-sm">
              궁금한 점이나 제안 사항을 남겨 주세요.
            </p>
            {(contactEmail || operatingHours) && (
              <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-400 space-y-1">
                {contactEmail && (
                  <p>
                    이메일:{" "}
                    <a
                      href={`mailto:${contactEmail}`}
                      className="text-violet-400 hover:underline"
                    >
                      {contactEmail}
                    </a>
                  </p>
                )}
                {operatingHours && <p>운영시간: {operatingHours}</p>}
              </div>
            )}
          </div>

          {/* 문의 폼 */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 이름 */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-gray-300 text-sm font-medium">
                이름 <span className="text-red-400">*</span>
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                maxLength={50}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-violet-500"
              />
            </div>

            {/* 이메일 */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-gray-300 text-sm font-medium">
                이메일 <span className="text-red-400">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                maxLength={320}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-violet-500"
              />
            </div>

            {/* 문의 유형 */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm font-medium">
                문의 유형 <span className="text-red-400">*</span>
              </Label>
              <Select
                value={form.inquiryType}
                onValueChange={(v) => setForm((f) => ({ ...f, inquiryType: v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-violet-500">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {INQUIRY_TYPES.map((t) => (
                    <SelectItem
                      key={t.value}
                      value={t.value}
                      className="text-gray-200 focus:bg-violet-500/20"
                    >
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 문의 내용 */}
            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-gray-300 text-sm font-medium">
                문의 내용 <span className="text-red-400">*</span>
              </Label>
              <Textarea
                id="message"
                placeholder="문의 내용을 입력해 주세요."
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                required
                maxLength={2000}
                rows={6}
                className="bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-violet-500 resize-none"
              />
              <p className="text-xs text-gray-600 text-right">
                {form.message.length} / 2000
              </p>
            </div>

            {/* 구분선 */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <p className="text-xs text-gray-500 mb-2">
                개인정보 수집 및 이용에 관한 동의 (필수)
              </p>

              {/* 전체 동의 */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <Checkbox
                  id="contact-agree-all"
                  checked={agreedTerms && agreedPrivacy}
                  onCheckedChange={(checked) => {
                    setAgreedTerms(Boolean(checked));
                    setAgreedPrivacy(Boolean(checked));
                  }}
                />
                <Label
                  htmlFor="contact-agree-all"
                  className="font-semibold text-violet-400 cursor-pointer text-sm"
                >
                  전체 동의하기
                </Label>
              </div>

              {/* 이용약관 */}
              <div className="flex items-start gap-3 pl-1">
                <Checkbox
                  id="contact-terms"
                  checked={agreedTerms}
                  onCheckedChange={(checked) => setAgreedTerms(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="contact-terms"
                    className="cursor-pointer text-sm text-gray-300"
                  >
                    이용약관 동의{" "}
                    <span className="text-red-400 font-semibold">(필수)</span>
                  </Label>
                  <div className="mt-0.5">
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-500 hover:underline"
                    >
                      이용약관 전문 보기 →
                    </a>
                  </div>
                </div>
              </div>

              {/* 개인정보처리방침 */}
              <div className="flex items-start gap-3 pl-1">
                <Checkbox
                  id="contact-privacy"
                  checked={agreedPrivacy}
                  onCheckedChange={(checked) => setAgreedPrivacy(Boolean(checked))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="contact-privacy"
                    className="cursor-pointer text-sm text-gray-300"
                  >
                    개인정보처리방침 동의{" "}
                    <span className="text-red-400 font-semibold">(필수)</span>
                  </Label>
                  <div className="mt-0.5">
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-500 hover:underline"
                    >
                      개인정보처리방침 전문 보기 →
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* 제출 버튼 */}
            <Button
              type="submit"
              disabled={!isValid || loading}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  전송 중...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  문의 보내기
                </>
              )}
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
