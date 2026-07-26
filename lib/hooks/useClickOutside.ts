"use client";

import { useEffect, useRef } from "react";

/**
 * Closes an open dropdown/popover on an outside pointer interaction
 * (mouse or touch) while it's active — one listener pair per active
 * container, cleaned up the moment it isn't needed. Attach the returned
 * ref to the popover's outermost element (the one that should stay open
 * when clicked inside).
 */
export function useClickOutside<T extends HTMLElement>(active: boolean, onOutside: () => void) {
  const ref = useRef<T>(null);
  const onOutsideRef = useRef(onOutside);
  useEffect(() => {
    onOutsideRef.current = onOutside;
  });

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutsideRef.current();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [active]);

  return ref;
}
