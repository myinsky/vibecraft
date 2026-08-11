/**
 * 경량 인메모리 캐시 유틸리티
 * - TTL(Time-To-Live) 기반 자동 만료
 * - 캐시 무효화(invalidate) 지원
 * - 동일 키 동시 요청 시 중복 DB 호출 방지 (request coalescing)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  /**
   * 캐시에서 값을 가져오거나, 없으면 fetcher를 실행하여 저장
   * @param key 캐시 키
   * @param fetcher 데이터를 가져오는 비동기 함수
   * @param ttlMs TTL (밀리초), 기본 60초
   */
  async get<T>(key: string, fetcher: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const now = Date.now();
    const cached = this.store.get(key) as CacheEntry<T> | undefined;

    // 유효한 캐시 히트
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    // 이미 진행 중인 요청이 있으면 그것을 기다림 (중복 DB 호출 방지)
    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<T>;
    }

    // 새 요청 실행
    const promise = fetcher().then((value) => {
      this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
      this.inflight.delete(key);
      return value;
    }).catch((err) => {
      this.inflight.delete(key);
      throw err;
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * 특정 키 또는 접두사로 시작하는 모든 캐시 무효화
   */
  invalidate(keyOrPrefix: string) {
    const keys = Array.from(this.store.keys());
    for (const key of keys) {
      if (key === keyOrPrefix || key.startsWith(keyOrPrefix + ':')) {
        this.store.delete(key);
      }
    }
  }

  /**
   * 전체 캐시 초기화
   */
  clear() {
    this.store.clear();
  }

  /**
   * 만료된 항목 정리 (선택적 호출)
   */
  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}

export const cache = new MemoryCache();

// 10분마다 만료 항목 자동 정리
setInterval(() => cache.cleanup(), 10 * 60 * 1000);

// TTL 상수 (TTFB 개선: DB 쿼리 빈도 감소)
// 인덱스 추가 후 DB 쿼리가 빠르므로 캐시 TTL을 줄여 신선도 향상
export const TTL = {
  SHORT: 30_000,        // 30초 - 자주 변경되는 데이터 (최신글 등)
  MEDIUM: 2 * 60_000,  // 2분  - 카테고리별 포스트 목록, 관련글, 태그 (5분 → 2분)
  LONG: 15 * 60_000,   // 15분 - 사이트 설정, 네비게이션, 사이드바 (30분 → 15분)
} as const;
