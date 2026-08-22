"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function OrderDrawerShell({ eyebrow, title, closeHref, actions, children }: {
  eyebrow: string;
  title: string;
  closeHref: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  const close = () => router.replace(closeHref, { scroll: false });

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right) close();
      }}
      className="order-drawer m-0 ml-auto h-dvh max-h-none w-full max-w-[560px] overflow-y-auto border-0 bg-[#fffdfb] p-0 text-[#403730] shadow-[-24px_0_70px_rgba(36,28,24,.16)]"
    >
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#eee5de] bg-[#fffdfb]/95 px-5 py-4 backdrop-blur">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C85956]">{eyebrow}</p>
          <h2 className="mt-1 truncate text-lg font-extrabold tracking-[-0.03em] text-[#242424]">{title}</h2>
        </div>
        <div className="flex flex-none items-center gap-2">
          {actions}
          <button type="button" onClick={close} aria-label="Close order details" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e7ddd5] text-[#665950] transition-colors hover:bg-[#f7f1ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      {children}
      <style jsx global>{`
        .order-drawer::backdrop { background: rgba(36, 28, 24, .28); backdrop-filter: blur(2px); }
        .order-drawer[open] { animation: order-drawer-in 220ms cubic-bezier(.32,.72,0,1) both; }
        @keyframes order-drawer-in { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: translateX(0); } }
        @media (prefers-reduced-motion: reduce) { .order-drawer[open] { animation: none; } }
      `}</style>
    </dialog>
  );
}
