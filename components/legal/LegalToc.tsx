"use client";

import { useEffect, useRef, useState } from "react";

export interface LegalTocEntry {
  id: string;
  title: string;
}

function scrollToSection(id: string) {
  // On /terms, sections live inside collapsed accordion rows — if this id
  // has a trigger button that's currently closed, open it first so the
  // content being scrolled to is actually visible. No-op on /privacy,
  // where no such trigger exists.
  const trigger = document.getElementById(`${id}-trigger`);
  if (trigger && trigger.getAttribute("aria-expanded") === "false") {
    trigger.click();
  }

  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    // Keeps the URL deep-linkable without re-triggering the browser's own
    // (non-smooth) jump-to-anchor behavior.
    history.replaceState(null, "", `#${id}`);
    target.focus({ preventScroll: true });
  });
}

function TocLink({
  id,
  title,
  active,
  onNavigate,
}: {
  id: string;
  title: string;
  active: boolean;
  onNavigate: (id: string) => void;
}) {
  return (
    <a
      href={`#${id}`}
      aria-current={active ? "true" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(id);
      }}
      className={`block rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "bg-beige-100 text-mahalyred"
          : "text-ink-soft/65 hover:bg-stone-50 hover:text-ink"
      }`}
    >
      {title}
    </a>
  );
}

export default function LegalToc({ sections }: { sections: LegalTocEntry[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headings = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!headings.length) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-112px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((heading) => observerRef.current?.observe(heading));
    return () => observerRef.current?.disconnect();
  }, [sections]);

  return (
    <>
      {/* Desktop: sticky vertical table of contents */}
      <nav
        aria-label="On this page"
        className="sticky top-28 hidden max-h-[calc(100vh-8rem)] w-full shrink-0 overflow-y-auto lg:block lg:w-60"
      >
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft/50">
          On this page
        </p>
        <div className="space-y-0.5">
          {sections.map((section) => (
            <TocLink
              key={section.id}
              id={section.id}
              title={section.title}
              active={section.id === activeId}
              onNavigate={scrollToSection}
            />
          ))}
        </div>
      </nav>

      {/* Tablet/mobile: collapsible "On this page" control — native
          <details> so the disclosure behavior is keyboard- and
          screen-reader-accessible without extra ARIA wiring. */}
      <details className="mb-6 rounded-xl2 border border-stone-150 bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
          On this page
          <span aria-hidden="true" className="text-ink-soft/50">
            +
          </span>
        </summary>
        <nav aria-label="On this page" className="flex gap-2 overflow-x-auto px-4 pb-4 no-scrollbar">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToSection(section.id);
              }}
              className="shrink-0 whitespace-nowrap rounded-full border border-stone-150 bg-stone-50 px-3.5 py-1.5 text-[12.5px] font-medium text-ink-soft/75 hover:text-ink"
            >
              {section.title}
            </a>
          ))}
        </nav>
      </details>
    </>
  );
}
