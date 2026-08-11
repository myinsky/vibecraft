import { useCallback, useRef } from "react";

/**
 * useRipple - 버튼/요소 클릭 시 터치 위치에 Ripple(파문) 효과를 생성하는 훅
 *
 * 사용법:
 *   const { rippleHandlers } = useRipple();
 *   <button {...rippleHandlers} className="relative overflow-hidden ...">
 *
 * 주의: 적용 요소에 반드시 `position: relative`와 `overflow: hidden`이 있어야 합니다.
 */
export function useRipple() {
  const containerRef = useRef<HTMLElement | null>(null);

  const createRipple = useCallback(
    (clientX: number, clientY: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      const x = clientX - rect.left - size / 2;
      const y = clientY - rect.top - size / 2;

      const ripple = document.createElement("span");
      ripple.className = "ripple-wave";
      ripple.style.cssText = `
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        width: ${size}px;
        height: ${size}px;
        left: ${x}px;
        top: ${y}px;
        transform: scale(0);
        animation: ripple-expand 550ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
        background: currentColor;
        opacity: 0.18;
        z-index: 0;
      `;

      element.appendChild(ripple);

      // 애니메이션 완료 후 DOM에서 제거
      ripple.addEventListener("animationend", () => {
        ripple.remove();
      });
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // 마우스 왼쪽 버튼 또는 터치만 처리
      if (e.pointerType === "mouse" && e.button !== 0) return;
      createRipple(e.clientX, e.clientY, e.currentTarget);
    },
    [createRipple]
  );

  return {
    rippleHandlers: {
      onPointerDown: handlePointerDown,
      ref: containerRef,
    } as const,
  };
}
