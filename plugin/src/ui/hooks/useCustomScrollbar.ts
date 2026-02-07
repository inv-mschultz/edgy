import { useState, useEffect, useCallback, useRef, RefObject } from "react";

interface CustomScrollbarState {
  showScrollbar: boolean;
  thumbHeight: number;
  thumbTop: number;
  isDragging: boolean;
}

interface CustomScrollbarActions {
  handleThumbMouseDown: (e: React.MouseEvent) => void;
  handleTrackClick: (e: React.MouseEvent) => void;
}

export function useCustomScrollbar(
  scrollRef: RefObject<HTMLDivElement>,
  recalcDep?: unknown
): CustomScrollbarState & CustomScrollbarActions {
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef(0);
  const dragStartScrollTop = useRef(0);

  const updateScrollbar = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollHeight, clientHeight, scrollTop } = el;
    const hasScroll = scrollHeight > clientHeight;
    setShowScrollbar(hasScroll);

    if (hasScroll) {
      const trackHeight = clientHeight;
      const ratio = clientHeight / scrollHeight;
      const newThumbHeight = Math.max(ratio * trackHeight, 30);
      const maxThumbTop = trackHeight - newThumbHeight;
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      const newThumbTop = scrollRatio * maxThumbTop;

      setThumbHeight(newThumbHeight);
      setThumbTop(newThumbTop);
    }
  }, [scrollRef]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollbar();

    el.addEventListener("scroll", updateScrollbar);
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollbar);
      resizeObserver.disconnect();
    };
  }, [scrollRef, updateScrollbar]);

  // Recalculate scrollbar when dependency changes (e.g., page navigation)
  useEffect(() => {
    if (recalcDep !== undefined) {
      // Reset scroll position and recalculate after a brief delay for DOM to update
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = 0;
      }
      requestAnimationFrame(() => {
        updateScrollbar();
      });
    }
  }, [recalcDep, scrollRef, updateScrollbar]);

  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartScrollTop.current = scrollRef.current?.scrollTop ?? 0;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const el = scrollRef.current;
        if (!el) return;

        const deltaY = moveEvent.clientY - dragStartY.current;
        const { scrollHeight, clientHeight } = el;
        const trackHeight = clientHeight;
        const maxThumbTop = trackHeight - thumbHeight;
        const scrollRatio = deltaY / maxThumbTop;
        const maxScrollTop = scrollHeight - clientHeight;

        el.scrollTop = dragStartScrollTop.current + scrollRatio * maxScrollTop;
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [scrollRef, thumbHeight]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      const el = scrollRef.current;
      if (!el) return;

      const trackRect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - trackRect.top;
      const { scrollHeight, clientHeight } = el;
      const trackHeight = clientHeight;
      const scrollRatio = clickY / trackHeight;
      const maxScrollTop = scrollHeight - clientHeight;

      el.scrollTop = scrollRatio * maxScrollTop;
    },
    [scrollRef]
  );

  return {
    showScrollbar,
    thumbHeight,
    thumbTop,
    isDragging,
    handleThumbMouseDown,
    handleTrackClick,
  };
}
