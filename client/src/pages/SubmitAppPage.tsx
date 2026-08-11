import { useState, useRef } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, Monitor, Smartphone, Globe,
  FileText, Layers, HelpCircle, ChevronRight, Clock, XCircle
} from "lucide-react";

interface FileUploadState {
  file: File | null;
  url: string;
  filename: string;
  uploading: boolean;
  progress: number;
  error: string;
}

function FileUploadWidget({
  label,
  icon,
  accept,
  value,
  onChange,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  accept?: string;
  value: FileUploadState;
  onChange: (state: FileUploadState) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onChange({ ...value, file, uploading: true, progress: 0, error: "" });

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onChange({ ...value, file, uploading: true, progress: Math.round((ev.loaded / ev.total) * 100), error: "" });
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        onChange({
          file,
          url: data.url,
          filename: data.filename || file.name,
          uploading: false,
          progress: 100,
          error: "",
        });
      } else {
        onChange({ ...value, file, uploading: false, progress: 0, error: "업로드 실패. 다시 시도해주세요." });
      }
    };

    xhr.onerror = () => {
      onChange({ ...value, file, uploading: false, progress: 0, error: "네트워크 오류가 발생했습니다." });
    };

    xhr.open("POST", "/api/upload/file");
    xhr.withCredentials = true;
    xhr.send(formData);
  };

  const handleRemove = () => {
    onChange({ file: null, url: "", filename: "", uploading: false, progress: 0, error: "" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {value.url ? (
        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-400 flex-1 truncate">{value.filename}</span>
          <Button variant="ghost" size="sm" onClick={handleRemove} className="h-6 w-6 p-0 text-green-600 hover:text-red-500">
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : value.uploading ? (
        <div className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>업로드 중... {value.progress}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div
              className="bg-primary h-1.5 rounded-full transition-all"
              style={{ width: `${value.progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">클릭하여 파일 선택</p>
          {value.error && (
            <p className="text-xs text-red-500 mt-1">{value.error}</p>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

const EMPTY_FILE: FileUploadState = { file: null, url: "", filename: "", uploading: false, progress: 0, error: "" };

export default function SubmitAppPage() {
  const { user, isAuthenticated, loading } = useAuth();

  const [form, setForm] = useState({
    name: "",
    description: "",
    longDescription: "",
    category: "",
    techStack: "",
    features: "",
    howToUse: "",
    appUrl: "",
  });
  const [thumbnail, setThumbnail] = useState<FileUploadState>(EMPTY_FILE);
  const [pcFile, setPcFile] = useState<FileUploadState>(EMPTY_FILE);
  const [mobileFile, setMobileFile] = useState<FileUploadState>(EMPTY_FILE);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitMutation = trpc.apps.submit.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: (err) => setErrors({ submit: err.message }),
  });

  const { data: mySubmissions } = trpc.apps.mySubmissions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) newErrors.name = "앱 이름을 입력해주세요.";
    if (!form.description.trim()) newErrors.description = "앱 설명을 입력해주세요.";
    if (!form.appUrl && !pcFile.url && !mobileFile.url) {
      newErrors.appUrl = "앱 URL 또는 파일 중 하나 이상을 입력해주세요.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    submitMutation.mutate({
      ...form,
      appUrl: form.appUrl || undefined,
      thumbnail: thumbnail.url || undefined,
      pcDownloadUrl: pcFile.url || null,
      pcOriginalFilename: pcFile.filename || null,
      mobileDownloadUrl: mobileFile.url || null,
      mobileOriginalFilename: mobileFile.filename || null,
    });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-yellow-600 border-yellow-400 gap-1"><Clock className="w-3 h-3" />검토중</Badge>;
      case "approved": return <Badge variant="outline" className="text-green-600 border-green-400 gap-1"><CheckCircle className="w-3 h-3" />승인됨</Badge>;
      case "rejected": return <Badge variant="outline" className="text-red-600 border-red-400 gap-1"><XCircle className="w-3 h-3" />거절됨</Badge>;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <Card className="max-w-md w-full text-center">
            <CardHeader>
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <CardTitle>로그인이 필요합니다</CardTitle>
              <CardDescription>앱을 등록 신청하려면 먼저 로그인해주세요.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href={getLoginUrl("/submit-app")}>로그인하기</a>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </>
    );
  }

  // 개발자 등록 여부 체크
  const userExt = user as any;
  if (isAuthenticated && !userExt?.isDeveloper) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <Card className="max-w-md w-full text-center">
            <CardHeader>
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
              </div>
              <CardTitle>개발자 등록이 필요합니다</CardTitle>
              <CardDescription>
                앱을 등록 신청하려면 먼저 개발자로 등록해야 합니다.
                <br />
                <span className="text-sm text-muted-foreground">내 정보 페이지에서 개발자 등록을 완료해주세요.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                <a href="/my-profile">개발자 등록하러 가기</a>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <a href="/">홈으로 돌아가기</a>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </>
    );
  }

  if (submitted) {
    return (
      <>
        <Header />
        <main className="min-h-screen flex items-center justify-center px-4">
          <Card className="max-w-lg w-full text-center">
            <CardHeader>
              <div className="w-20 h-20 bg-green-100 dark:bg-green-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">신청이 완료되었습니다!</CardTitle>
              <CardDescription className="text-base mt-2">
                앱 등록 신청이 접수되었습니다. 관리자 검토 후 승인 여부를 알려드립니다.
                <br />
                <span className="text-sm text-muted-foreground mt-1 block">보통 1~3일 내 검토가 완료됩니다.</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full" style={{ background: "linear-gradient(135deg, #5B5BF6, #7C3AED)", color: "white" }}>
                <a href="/page/page21">📱 앱쇼룸 보기</a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
                다른 앱 신청하기
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <a href="/">홈으로 돌아가기</a>
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* 헤더 */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <a href="/" className="hover:text-foreground transition-colors">홈</a>
              <ChevronRight className="w-4 h-4" />
              <span>앱 등록 신청</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">앱 등록 신청</h1>
            <p className="text-muted-foreground">
              직접 만든 앱을 등록하고 더 많은 사람들에게 알려보세요.
              관리자 검토 후 승인되면 사이트에 게시됩니다.
            </p>
          </div>

          {/* 내 신청 현황 */}
          {mySubmissions && mySubmissions.filter(s => s.submissionStatus !== 'direct').length > 0 && (
            <Card className="mb-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">내 신청 현황</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mySubmissions
                    .filter(s => s.submissionStatus !== 'direct')
                    .map(app => (
                      <div key={app.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{app.name}</p>
                          <p className="text-xs text-muted-foreground">{new Date(app.createdAt).toLocaleDateString()}</p>
                          {app.submissionStatus === 'rejected' && app.rejectionReason && (
                            <p className="text-xs text-red-500 mt-1">거절 사유: {app.rejectionReason}</p>
                          )}
                        </div>
                        {statusBadge(app.submissionStatus)}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 신청 폼 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 기본 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  기본 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">
                    앱 이름 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    placeholder="예: 구글 SEO 글쓰기 프로그램"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={errors.name ? "border-red-400" : ""}
                  />
                  {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">
                    앱 설명 (한 줄) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="description"
                    placeholder="앱을 한 문장으로 설명해주세요"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className={errors.description ? "border-red-400" : ""}
                  />
                  {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="longDescription">상세 설명</Label>
                  <Textarea
                    id="longDescription"
                    placeholder="앱의 주요 기능, 사용 방법, 개발 배경 등을 자유롭게 작성해주세요"
                    rows={5}
                    value={form.longDescription}
                    onChange={e => setForm(f => ({ ...f, longDescription: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="category">카테고리</Label>
                    <Select
                      value={form.category}
                      onValueChange={val => setForm(f => ({ ...f, category: val }))}
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="카테고리 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ai">🤖 AI / 자동화</SelectItem>
                        <SelectItem value="productivity">⚡ 생산성</SelectItem>
                        <SelectItem value="writing">✍️ 글쓰기</SelectItem>
                        <SelectItem value="seo">🔍 SEO / 마케팅</SelectItem>
                        <SelectItem value="image">🎨 이미지 / 디자인</SelectItem>
                        <SelectItem value="video">🎥 동영상 / 미디어</SelectItem>
                        <SelectItem value="data">📊 데이터 / 분석</SelectItem>
                        <SelectItem value="education">📚 교육 / 학습</SelectItem>
                        <SelectItem value="business">💼 비즈니스</SelectItem>
                        <SelectItem value="utility">🔧 유틸리티</SelectItem>
                        <SelectItem value="other">📦 기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="techStack">기술 스택</Label>
                    <Input
                      id="techStack"
                      placeholder="예: React, Python, Claude API"
                      value={form.techStack}
                      onChange={e => setForm(f => ({ ...f, techStack: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 앱 접근 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  앱 접근 정보
                </CardTitle>
                <CardDescription>앱 URL 또는 파일 중 하나 이상 입력해주세요.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="appUrl" className="flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    앱 URL
                  </Label>
                  <Input
                    id="appUrl"
                    placeholder="https://myapp.com"
                    value={form.appUrl}
                    onChange={e => setForm(f => ({ ...f, appUrl: e.target.value }))}
                    className={errors.appUrl ? "border-red-400" : ""}
                  />
                  {errors.appUrl && <p className="text-xs text-red-500">{errors.appUrl}</p>}
                </div>

                <div className="border-t pt-4 space-y-4">
                  <FileUploadWidget
                    label="PC용 앱 파일"
                    icon={<Monitor className="w-4 h-4 text-blue-500" />}
                    accept=".exe,.msi,.dmg,.pkg,.zip,.tar.gz,.AppImage"
                    value={pcFile}
                    onChange={setPcFile}
                    hint="Windows(.exe, .msi), macOS(.dmg, .pkg), Linux(.AppImage) 등 지원"
                  />

                  <FileUploadWidget
                    label="스마트폰용 앱 파일"
                    icon={<Smartphone className="w-4 h-4 text-green-500" />}
                    accept=".apk,.ipa,.zip"
                    value={mobileFile}
                    onChange={setMobileFile}
                    hint="Android(.apk), iOS(.ipa) 또는 앱스토어/플레이스토어 링크를 앱 URL에 입력하세요"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 추가 정보 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  추가 정보 (선택)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="features">주요 기능</Label>
                  <Textarea
                    id="features"
                    placeholder="앱의 주요 기능을 나열해주세요&#10;예: 1. AI 기반 SEO 최적화&#10;2. 자동 키워드 분석&#10;3. 원클릭 발행"
                    rows={3}
                    value={form.features}
                    onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="howToUse" className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4" />
                    사용 방법
                  </Label>
                  <Textarea
                    id="howToUse"
                    placeholder="앱 사용 방법을 간단히 설명해주세요"
                    rows={3}
                    value={form.howToUse}
                    onChange={e => setForm(f => ({ ...f, howToUse: e.target.value }))}
                  />
                </div>

                <FileUploadWidget
                  label="앱 썸네일 이미지"
                  icon={<Upload className="w-4 h-4 text-purple-500" />}
                  accept="image/*"
                  value={thumbnail}
                  onChange={setThumbnail}
                  hint="앱을 대표하는 이미지 (권장: 16:9 비율, 최소 800x450px)"
                />
              </CardContent>
            </Card>

            {/* 안내 및 제출 */}
            <div className="bg-muted/40 border rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">신청 전 확인사항</p>
                <p>• 직접 개발하거나 배포 권한이 있는 앱만 신청해주세요.</p>
                <p>• 악성 코드, 저작권 침해, 불법 콘텐츠가 포함된 앱은 거절됩니다.</p>
                <p>• 검토 후 승인/거절 결과는 사이트 알림으로 안내됩니다.</p>
              </div>
            </div>

            {errors.submit && (
              <div className="flex items-center gap-2 text-red-500 text-sm p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {errors.submit}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitMutation.isPending || pcFile.uploading || mobileFile.uploading || thumbnail.uploading}
            >
              {submitMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />신청 중...</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />앱 등록 신청하기</>
              )}
            </Button>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
