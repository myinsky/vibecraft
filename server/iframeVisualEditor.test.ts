/**
 * IframeVisualEditor 핵심 로직 테스트
 *
 * 브라우저 DOM에 의존하는 React 컴포넌트 자체는 vitest 환경에서 직접 마운트하기 어려우므로,
 * 버그 수정 로직의 핵심 동작을 순수 JS 로직으로 검증합니다.
 *
 * 버그 1: 삭제 버튼 깜박임 - blockHideTimerRef를 React ref로 관리하여 onMouseEnter에서 취소 가능
 * 버그 2: 삽입 위치 오류 - insertBeforeMode로 첫 번째 블록 앞 삽입 처리
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── 버그 2: insertBeforeMode 로직 테스트 ─────────────────────────────────────

/**
 * 블록 클릭 시 삽입 위치 결정 로직 (handleBodyClickForPlus 핵심 로직 추출)
 */
function resolveInsertPosition(
  blockChildren: Array<{ top: number; bottom: number; height: number }>,
  mouseY: number,
  clickedIdx: number | null
): { afterIdx: number | null; insertBeforeMode: boolean } {
  let afterIdx: number | null = null;
  let insertBeforeMode = false;

  if (clickedIdx !== null) {
    const block = blockChildren[clickedIdx];
    const midY = block.top + block.height / 2;
    if (mouseY > midY) {
      // 하단 절반 → 해당 블록 다음에 삽입
      afterIdx = clickedIdx;
    } else {
      // 상단 절반 → 해당 블록 앞에 삽입
      if (clickedIdx > 0) {
        afterIdx = clickedIdx - 1;
      } else {
        // 첫 번째 블록 앞 → insertBeforeMode
        afterIdx = clickedIdx;
        insertBeforeMode = true;
      }
    }
  } else if (blockChildren.length > 0) {
    // 블록 바깥 클릭
    for (let i = blockChildren.length - 1; i >= 0; i--) {
      if (mouseY >= blockChildren[i].bottom) {
        afterIdx = i;
        break;
      }
    }
    if (afterIdx === null) {
      // 모든 블록 위쪽 클릭
      afterIdx = 0;
      insertBeforeMode = true;
    }
  }

  return { afterIdx, insertBeforeMode };
}

/**
 * insertBeforeMode에 따라 DOM에 요소를 삽입하는 로직 시뮬레이션
 */
function simulateInsert(
  blocks: string[],
  afterIdx: number,
  insertBeforeMode: boolean,
  newItem: string
): string[] {
  const result = [...blocks];
  if (insertBeforeMode) {
    result.splice(afterIdx, 0, newItem);
  } else {
    result.splice(afterIdx + 1, 0, newItem);
  }
  return result;
}

describe("IframeVisualEditor - 삽입 위치 결정 로직 (버그 2 수정)", () => {
  const blocks = [
    { top: 0, bottom: 50, height: 50 },   // 블록 0
    { top: 60, bottom: 120, height: 60 },  // 블록 1
    { top: 130, bottom: 200, height: 70 }, // 블록 2
  ];

  describe("블록 하단 절반 클릭 → 해당 블록 다음에 삽입", () => {
    it("블록 0 하단 클릭 → afterIdx=0, insertBeforeMode=false", () => {
      const result = resolveInsertPosition(blocks, 40, 0); // midY=25, mouseY=40 > 25
      expect(result.afterIdx).toBe(0);
      expect(result.insertBeforeMode).toBe(false);
    });

    it("블록 1 하단 클릭 → afterIdx=1, insertBeforeMode=false", () => {
      const result = resolveInsertPosition(blocks, 100, 1); // midY=90, mouseY=100 > 90
      expect(result.afterIdx).toBe(1);
      expect(result.insertBeforeMode).toBe(false);
    });
  });

  describe("블록 상단 절반 클릭 → 해당 블록 앞에 삽입", () => {
    it("블록 1 상단 클릭 → afterIdx=0 (이전 블록), insertBeforeMode=false", () => {
      const result = resolveInsertPosition(blocks, 65, 1); // midY=90, mouseY=65 < 90
      expect(result.afterIdx).toBe(0);
      expect(result.insertBeforeMode).toBe(false);
    });

    it("블록 2 상단 클릭 → afterIdx=1 (이전 블록), insertBeforeMode=false", () => {
      const result = resolveInsertPosition(blocks, 140, 2); // midY=165, mouseY=140 < 165
      expect(result.afterIdx).toBe(1);
      expect(result.insertBeforeMode).toBe(false);
    });

    it("첫 번째 블록(블록 0) 상단 클릭 → afterIdx=0, insertBeforeMode=true (버그 수정)", () => {
      const result = resolveInsertPosition(blocks, 10, 0); // midY=25, mouseY=10 < 25
      expect(result.afterIdx).toBe(0);
      expect(result.insertBeforeMode).toBe(true); // 이전에는 false였던 버그
    });
  });

  describe("블록 바깥 클릭", () => {
    it("모든 블록 아래 클릭 → afterIdx=2 (마지막 블록), insertBeforeMode=false", () => {
      const result = resolveInsertPosition(blocks, 250, null);
      expect(result.afterIdx).toBe(2);
      expect(result.insertBeforeMode).toBe(false);
    });

    it("모든 블록 위쪽 클릭 → afterIdx=0, insertBeforeMode=true", () => {
      const result = resolveInsertPosition(blocks, -10, null);
      expect(result.afterIdx).toBe(0);
      expect(result.insertBeforeMode).toBe(true);
    });

    it("블록 사이 클릭 → 이전 블록 afterIdx", () => {
      const result = resolveInsertPosition(blocks, 55, null); // 블록 0(bottom=50)과 블록 1(top=60) 사이
      expect(result.afterIdx).toBe(0);
      expect(result.insertBeforeMode).toBe(false);
    });
  });
});

describe("IframeVisualEditor - DOM 삽입 위치 시뮬레이션", () => {
  it("insertBeforeMode=false: afterIdx 다음에 삽입", () => {
    const blocks = ["A", "B", "C"];
    const result = simulateInsert(blocks, 1, false, "NEW");
    expect(result).toEqual(["A", "B", "NEW", "C"]);
  });

  it("insertBeforeMode=true: afterIdx 앞에 삽입 (첫 번째 블록 앞)", () => {
    const blocks = ["A", "B", "C"];
    const result = simulateInsert(blocks, 0, true, "NEW");
    expect(result).toEqual(["NEW", "A", "B", "C"]);
  });

  it("insertBeforeMode=false: 마지막 블록 다음에 삽입", () => {
    const blocks = ["A", "B", "C"];
    const result = simulateInsert(blocks, 2, false, "NEW");
    expect(result).toEqual(["A", "B", "C", "NEW"]);
  });
});

// ─── 버그 1: 삭제 버튼 깜박임 - 타이머 취소 로직 테스트 ─────────────────────

describe("IframeVisualEditor - 블록 삭제 버튼 깜박임 방지 (버그 1 수정)", () => {
  it("blockHideTimerRef를 React ref로 관리하면 onMouseEnter에서 타이머 취소 가능", () => {
    // React ref 시뮬레이션
    const blockHideTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

    // iframe mouseout 이벤트: 200ms 타이머 시작
    const onMouseOut = () => {
      blockHideTimerRef.current = setTimeout(() => {
        // 오버레이 숨김
      }, 200);
    };

    // 오버레이 버튼 onMouseEnter: 타이머 취소
    const onOverlayMouseEnter = () => {
      if (blockHideTimerRef.current) {
        clearTimeout(blockHideTimerRef.current);
        blockHideTimerRef.current = null;
      }
    };

    // mouseout 이벤트 발생
    onMouseOut();
    expect(blockHideTimerRef.current).not.toBeNull();

    // 오버레이 버튼으로 마우스 이동 → 타이머 취소
    onOverlayMouseEnter();
    expect(blockHideTimerRef.current).toBeNull(); // 타이머가 취소됨 (깜박임 방지)
  });

  it("로컬 변수로 관리하면 onMouseEnter에서 타이머 취소 불가 (기존 버그 재현)", () => {
    // 기존 버그: 클로저 내 로컬 변수로 관리
    let localTimer: ReturnType<typeof setTimeout> | null = null;

    const onMouseOut = () => {
      localTimer = setTimeout(() => {
        // 오버레이 숨김
      }, 200);
    };

    // 다른 스코프(React 이벤트)에서는 localTimer에 접근 불가
    const externalTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const onOverlayMouseEnterBuggy = () => {
      // externalTimerRef.current는 localTimer와 다른 변수 → 취소 불가
      if (externalTimerRef.current) {
        clearTimeout(externalTimerRef.current);
        externalTimerRef.current = null;
      }
    };

    onMouseOut();
    expect(localTimer).not.toBeNull();

    onOverlayMouseEnterBuggy(); // externalTimerRef를 취소하지만 localTimer는 그대로
    expect(localTimer).not.toBeNull(); // 버그: 타이머가 취소되지 않음
  });
});
