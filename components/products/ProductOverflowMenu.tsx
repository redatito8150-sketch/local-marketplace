"use client";

import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

const subscribeToClient = () => () => {};

export default function ProductOverflowMenu({ label, children, onOpen }: { label: string; children: React.ReactNode; onOpen?: () => void }) {
  const mounted = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedMenuHeight = 220;
    setPosition({
      top: rect.bottom + estimatedMenuHeight > window.innerHeight
        ? Math.max(8, rect.top - estimatedMenuHeight)
        : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    onOpen?.();
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus());
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) return;
      closeMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu(true);
    }
    function handlePositionChange() {
      closeMenu();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handlePositionChange, true);
    window.addEventListener("resize", handlePositionChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handlePositionChange, true);
      window.removeEventListener("resize", handlePositionChange);
    };
  }, [open]);

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!event.key.startsWith("Arrow") && event.key !== "Home" && event.key !== "End") return;
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? (current - 1 + items.length) % items.length
          : (current + 1) % items.length;
    items[next].focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? closeMenu() : openMenu()}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-[#75685f] transition-colors duration-150 hover:bg-[#f1eae2] hover:text-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {mounted && open && position ? createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          style={{ position: "fixed", top: position.top, right: position.right }}
          onKeyDown={handleMenuKeyDown}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a,button")) closeMenu();
          }}
          className="z-[90] w-60 rounded-xl border border-[#e3dcd3] bg-white p-1.5 shadow-[0_14px_38px_rgba(52,39,31,0.16)]"
        >
          {children}
        </div>,
        document.body
      ) : null}
    </>
  );
}
