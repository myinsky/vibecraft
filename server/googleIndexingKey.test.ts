import { describe, it, expect } from 'vitest';

describe('GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY', () => {
  it('환경변수가 설정되어 있어야 함', () => {
    const key = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
    expect(key).toBeTruthy();
  });

  it('유효한 JSON 형식이어야 함', () => {
    const key = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY!;
    expect(() => JSON.parse(key)).not.toThrow();
  });

  it('service_account 타입이어야 함', () => {
    const key = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY!;
    const parsed = JSON.parse(key);
    expect(parsed.type).toBe('service_account');
  });

  it('필수 필드(client_email, private_key)가 있어야 함', () => {
    const key = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY!;
    const parsed = JSON.parse(key);
    expect(parsed.client_email).toBeTruthy();
    expect(parsed.private_key).toBeTruthy();
    expect(parsed.private_key).toContain('BEGIN PRIVATE KEY');
  });
});
