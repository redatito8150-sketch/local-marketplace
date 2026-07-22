"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import type { PageVersionRecord } from "@/lib/data/pageStudio";
import { PAGE_SECTION_REGISTRY, type PageSectionRecord } from "@/lib/pageStudio/registry";
import PageStudioImageField from "@/components/admin/PageStudioImageField";

type Config = Record<string, unknown>;
type Item = Record<string, unknown>;

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2.5 text-[13px] text-[var(--admin-text)] outline-none focus:border-[var(--admin-primary)]/55 focus:ring-2 focus:ring-[var(--admin-primary)]/10";
const labelClass = "block text-[11.5px] font-bold text-[var(--admin-text-muted)]";

function itemsFrom(config: Config): { items: Item[]; keyed: string[] | null } {
  if (Array.isArray(config.items)) return { items: config.items as Item[], keyed: null };
  const entries = Object.entries(config).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
  if (entries.length) return { items: entries.map(([, value]) => value as Item), keyed: entries.map(([key]) => key) };
  return { items: [], keyed: null };
}

function putItems(config: Config, items: Item[], keyed: string[] | null): Config {
  if (keyed && keyed.length === items.length) {
    return Object.fromEntries(keyed.map((key, index) => [key, items[index]]));
  }
  return { ...config, items };
}

function TextField({ label, value, onChange, multiline = false }: { label: string; value: unknown; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className={labelClass}>
      {label}
      {multiline ? (
        <textarea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} rows={3} className={inputClass} />
      ) : (
        <input value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={inputClass} />
      )}
    </label>
  );
}

function SectionFields({ pageKey, section, onChange }: { pageKey: string; section: PageSectionRecord; onChange: (config: Config) => void }) {
  const config = section.config;
  const patch = (next: Config) => onChange({ ...config, ...next });

  if (section.sectionType === "hero") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${labelClass} sm:col-span-2`}>
          Heading lines
          <textarea value={Array.isArray(config.headingLines) ? config.headingLines.join("\n") : ""} onChange={(event) => patch({ headingLines: event.target.value.split("\n") })} rows={4} className={inputClass} />
          <span className="mt-1 block font-normal">Use one line per heading line.</span>
        </label>
        <div className="sm:col-span-2"><TextField label="Subheading" value={config.subheading} onChange={(value) => patch({ subheading: value })} multiline /></div>
        <TextField label="Button label" value={config.ctaLabel} onChange={(value) => patch({ ctaLabel: value })} />
        <TextField label="Button link" value={config.ctaHref ?? "/brands"} onChange={(value) => patch({ ctaHref: value })} />
        {config.image != null && <div className="sm:col-span-2"><PageStudioImageField pageKey={pageKey} label="Hero image" value={String(config.image ?? "")} onChange={(value) => patch({ image: value })} /></div>}
      </div>
    );
  }

  if (["product_carousel", "product_grid", "all_products_preview", "custom_product_collection"].includes(section.sectionType)) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label="Section title" value={config.title} onChange={(value) => patch({ title: value })} />
        {section.sectionType !== "all_products_preview" && section.sectionType !== "custom_product_collection" && (
          <label className={labelClass}>Product source
            <select value={String(config.source ?? "new")} onChange={(event) => patch({ source: event.target.value })} className={inputClass}>
              <option value="new">New arrivals</option><option value="trending">Trending</option><option value="bestsellers">Best sellers</option><option value="featured">Featured</option><option value="all">All active products</option>
            </select>
          </label>
        )}
        <label className={labelClass}>Item count
          <input type="number" min={1} max={20} value={Number(config.itemCount ?? config.limit ?? 10)} onChange={(event) => patch({ itemCount: Number(event.target.value), ...(config.limit != null ? { limit: Number(event.target.value) } : {}) })} className={inputClass} />
        </label>
        <label className={labelClass}>Display
          <select value={String(config.displayStyle ?? "carousel")} onChange={(event) => patch({ displayStyle: event.target.value })} className={inputClass}><option value="carousel">Carousel</option><option value="grid">Grid</option></select>
        </label>
        {(section.sectionType === "all_products_preview" || section.sectionType === "product_grid") && (
          <label className={labelClass}>Sorting
            <select value={String(config.sorting ?? "newest")} onChange={(event) => patch({ sorting: event.target.value })} className={inputClass}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="top-rated">Top rated</option></select>
          </label>
        )}
        {section.sectionType === "all_products_preview" && (
          <label className="flex items-center gap-2 self-end pb-2.5 text-[12.5px] font-semibold text-[var(--admin-text)]"><input type="checkbox" checked={Boolean(config.featuredOnly)} onChange={(event) => patch({ featuredOnly: event.target.checked })} /> Featured products only</label>
        )}
      </div>
    );
  }

  if (section.sectionType === "category_cards" || section.sectionType === "mood_tiles") {
    const { items, keyed } = itemsFrom(config);
    const updateItem = (index: number, itemPatch: Item) => {
      const next = items.map((item, itemIndex) => itemIndex === index ? { ...item, ...itemPatch } : item);
      onChange(putItems(config, next, keyed));
    };
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={keyed?.[index] ?? String(item.id ?? index)} className="grid gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 sm:grid-cols-2">
            <TextField label={`Card ${index + 1} label`} value={item.label ?? item.title} onChange={(value) => updateItem(index, { label: value })} />
            <TextField label="Link" value={item.href} onChange={(value) => updateItem(index, { href: value })} />
            <PageStudioImageField pageKey={pageKey} label="Image" value={typeof item.image === "string" ? item.image : ""} onChange={(value) => updateItem(index, { image: value })} />
            <TextField label="Image alt text" value={item.imageAlt ?? ""} onChange={(value) => updateItem(index, { imageAlt: value })} />
          </div>
        ))}
      </div>
    );
  }

  if (section.sectionType === "benefits_strip") {
    const items = Array.isArray(config.items) ? config.items as Item[] : [];
    return <div className="grid gap-3 sm:grid-cols-2">{items.map((item, index) => (
      <div key={index} className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3">
        <TextField label={`Benefit ${index + 1}`} value={item.title} onChange={(value) => patch({ items: items.map((row, i) => i === index ? { ...row, title: value } : row) })} />
        <div className="mt-3"><TextField label="Detail" value={item.detail} onChange={(value) => patch({ items: items.map((row, i) => i === index ? { ...row, detail: value } : row) })} /></div>
      </div>
    ))}</div>;
  }

  if (section.sectionType === "featured_brand") {
    return <div className="grid gap-4 sm:grid-cols-2"><TextField label="Featured brand slug" value={config.featuredBrandSlug} onChange={(value) => patch({ featuredBrandSlug: value })} /><TextField label="Sponsored brand slugs" value={Array.isArray(config.sponsoredBrandSlugs) ? config.sponsoredBrandSlugs.join(", ") : ""} onChange={(value) => patch({ sponsoredBrandSlugs: value.split(",").map((slug) => slug.trim()).filter(Boolean) })} /></div>;
  }

  return <p className="rounded-xl bg-[var(--admin-surface-muted)] p-4 text-[12.5px] text-[var(--admin-text-muted)]">This section uses its safe default configuration. Additional structured fields will appear when it is added to a supported page.</p>;
}

async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "The request failed");
  return data;
}

export default function PageStudioEditor({ pageKey, initialSections, versions }: { pageKey: string; initialSections: PageSectionRecord[]; versions: PageVersionRecord[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [expanded, setExpanded] = useState<string | null>(initialSections[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirtyCount = useMemo(() => sections.filter((section, index) => JSON.stringify(section) !== JSON.stringify(initialSections[index])).length, [sections, initialSections]);

  const updateConfig = (id: string, config: Config) => setSections((rows) => rows.map((row) => row.id === id ? { ...row, config } : row));
  const save = async (section: PageSectionRecord) => {
    setBusy(`save:${section.id}`); setMessage(null);
    try {
      await requestJson(`/api/admin/page-studio/sections/${section.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: section.config, visible: section.visible }) });
      setMessage({ kind: "ok", text: `${PAGE_SECTION_REGISTRY[section.sectionType].label} draft saved.` });
      router.refresh();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Save failed" }); }
    finally { setBusy(null); }
  };

  const persistOrder = async (next: PageSectionRecord[], previous: PageSectionRecord[]) => {
    setSections(next); setBusy("reorder"); setMessage(null);
    try {
      await requestJson(`/api/admin/page-studio/${pageKey}/reorder`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionIds: next.map((section) => section.id) }) });
      setMessage({ kind: "ok", text: "Draft order saved." }); router.refresh();
    } catch (error) { setSections(previous); setMessage({ kind: "error", text: error instanceof Error ? error.message : "Reorder failed" }); }
    finally { setBusy(null); }
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length || busy) return;
    const next = [...sections]; [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next, sections);
  };

  const pageAction = async (action: "publish" | "discard") => {
    setBusy(action); setMessage(null);
    try {
      const data = await requestJson(`/api/admin/page-studio/${pageKey}/${action}`, { method: "POST" });
      setMessage({ kind: "ok", text: action === "publish" ? `Published as version ${data.version}.` : "Draft changes discarded." });
      router.refresh();
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Action failed" }); }
    finally { setBusy(null); }
  };

  return (
    <div className="pb-16">
      <div className="sticky -top-5 z-20 -mx-5 border-b border-[var(--admin-border)] bg-[var(--admin-bg)]/95 px-5 py-4 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><Link href="/admin/page-studio" aria-label="Back to Page Studio" className="rounded-lg p-2 hover:bg-[var(--admin-surface-muted)]"><ArrowLeft className="h-4 w-4" /></Link><div><h1 className="text-lg font-bold text-[var(--admin-text)]">Homepage editor</h1><p className="text-[11.5px] text-[var(--admin-text-muted)]">{dirtyCount ? `${dirtyCount} unsaved local change${dirtyCount === 1 ? "" : "s"}` : "Draft workspace"}</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setHistoryOpen((open) => !open)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-[12px] font-semibold"><History className="h-4 w-4" /> History</button>
            <Link href={`/admin/page-studio/${pageKey}/preview`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-[12px] font-semibold"><Eye className="h-4 w-4" /> Preview</Link>
            <Link href={`/admin/page-studio/${pageKey}/edit`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-[12px] font-semibold"><Pencil className="h-4 w-4" /> Edit Mode</Link>
            <button type="button" disabled={Boolean(busy)} onClick={() => void pageAction("discard")} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--admin-border)] px-3 text-[12px] font-semibold disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Discard draft</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void pageAction("publish")} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 text-[12px] font-bold text-white disabled:opacity-50">{busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish</button>
          </div>
        </div>
        {message && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{message.text}</p>}
      </div>

      {historyOpen && <div className="mt-5 rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4"><h2 className="text-sm font-bold text-[var(--admin-text)]">Published versions</h2><div className="mt-3 space-y-2">{versions.length ? versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--admin-surface-muted)] px-3 py-2.5"><div><p className="text-[12.5px] font-bold">Version {version.version}</p><p className="text-[11px] text-[var(--admin-text-muted)]">{new Date(version.createdAt).toLocaleString("en-US")}</p></div><button type="button" disabled={Boolean(busy)} onClick={async () => { setBusy(`restore:${version.version}`); try { await requestJson(`/api/admin/page-studio/${pageKey}/versions/${version.version}/restore`, { method: "POST" }); setMessage({ kind: "ok", text: `Version ${version.version} restored to draft. Review it before publishing.` }); router.refresh(); } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Restore failed" }); } finally { setBusy(null); } }} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-[11.5px] font-bold">Restore to draft</button></div>) : <p className="text-[12px] text-[var(--admin-text-muted)]">No published versions yet.</p>}</div></div>}

      <div className="mt-6 space-y-3">
        {sections.map((section, index) => {
          const isExpanded = expanded === section.id;
          return <section id={`section-${section.id}`} key={section.id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData("text/page-section", section.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const draggedId = event.dataTransfer.getData("text/page-section"); const from = sections.findIndex((row) => row.id === draggedId); if (from < 0 || from === index || busy) return; const next = [...sections]; const [dragged] = next.splice(from, 1); next.splice(index, 0, dragged); void persistOrder(next, sections); }} className={`overflow-hidden rounded-2xl border bg-[var(--admin-surface)] shadow-sm ${section.visible ? "border-[var(--admin-border)]" : "border-dashed border-[var(--admin-text-muted)]/35 opacity-75"}`}>
            <div className="flex min-h-16 items-center gap-2 px-3 sm:px-4">
              <GripVertical className="hidden h-5 w-5 cursor-grab text-[var(--admin-text-muted)]/55 sm:block" aria-hidden="true" />
              <button type="button" onClick={() => setExpanded(isExpanded ? null : section.id)} aria-expanded={isExpanded} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">{isExpanded ? <ChevronDown className="h-4 w-4 flex-none" /> : <ChevronRight className="h-4 w-4 flex-none" />}<span className="min-w-0"><span className="block truncate text-[13.5px] font-bold text-[var(--admin-text)]">{PAGE_SECTION_REGISTRY[section.sectionType].label}</span><span className="block text-[10.5px] text-[var(--admin-text-muted)]">{section.sectionKey}{section.isRequired ? " · Required" : ""}</span></span></button>
              <button type="button" disabled={index === 0 || Boolean(busy)} onClick={() => move(index, -1)} aria-label={`Move ${PAGE_SECTION_REGISTRY[section.sectionType].label} up`} className="rounded-lg p-2 hover:bg-[var(--admin-surface-muted)] disabled:opacity-25"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={index === sections.length - 1 || Boolean(busy)} onClick={() => move(index, 1)} aria-label={`Move ${PAGE_SECTION_REGISTRY[section.sectionType].label} down`} className="rounded-lg p-2 hover:bg-[var(--admin-surface-muted)] disabled:opacity-25"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" disabled={section.isRequired || Boolean(busy)} onClick={() => { const next = { ...section, visible: !section.visible }; setSections((rows) => rows.map((row) => row.id === section.id ? next : row)); void save(next); }} aria-label={section.visible ? "Hide section" : "Show section"} className="rounded-lg p-2 hover:bg-[var(--admin-surface-muted)] disabled:opacity-25">{section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
            </div>
            {isExpanded && <div className="border-t border-[var(--admin-border)] px-4 py-5 sm:px-6"><SectionFields pageKey={pageKey} section={section} onChange={(config) => updateConfig(section.id, config)} /><div className="mt-5 flex justify-end"><button type="button" disabled={Boolean(busy)} onClick={() => void save(section)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--admin-primary)] px-4 text-[12px] font-bold text-white disabled:opacity-50">{busy === `save:${section.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : message?.kind === "ok" ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} Save draft</button></div></div>}
          </section>;
        })}
      </div>
    </div>
  );
}
