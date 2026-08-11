/**
 * Google Indexing API 연동 모듈
 *
 * 새 게시글 발행 시 Google에 즉시 색인 요청을 보냅니다.
 * 환경변수 GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY가 없으면 조용히 건너뜁니다.
 * 실패해도 예외를 던지지 않으므로 발행 자체에는 영향이 없습니다.
 */

/**
 * Google OAuth 액세스 토큰 발급 (서비스 계정 JWT 방식)
 */
async function getGoogleAccessToken(serviceAccount: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const { SignJWT, importPKCS8 } = await import("jose");
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
  const jwt = await new SignJWT({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google OAuth 토큰 발급 실패 (${tokenRes.status}): ${body}`);
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };
  return access_token;
}

/**
 * 단일 URL을 Google Indexing API에 색인 요청
 * 실패해도 예외를 던지지 않음 (비동기 fire-and-forget 용도)
 */
export async function notifyGoogleIndexing(url: string): Promise<void> {
  const serviceAccountKey = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.log("[GoogleIndexing] 서비스 계정 키 없음 - 건너뜀");
    return;
  }

  try {
    let serviceAccount: { client_email: string; private_key: string };
    try {
      serviceAccount = JSON.parse(serviceAccountKey);
    } catch {
      console.warn("[GoogleIndexing] 서비스 계정 JSON 파싱 실패 - 건너뜀");
      return;
    }

    const accessToken = await getGoogleAccessToken(serviceAccount);

    const res = await fetch(
      "https://indexing.googleapis.com/v3/urlNotifications:publish",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, type: "URL_UPDATED" }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (res.ok) {
      console.log(`[GoogleIndexing] 색인 요청 성공: ${url}`);
    } else {
      const data = await res.json().catch(() => ({}));
      console.warn(
        `[GoogleIndexing] 색인 요청 실패 (${res.status}): ${(data as any)?.error?.message ?? ""} - ${url}`
      );
    }
  } catch (err) {
    console.warn("[GoogleIndexing] 색인 요청 오류 (무시):", err);
  }
}
