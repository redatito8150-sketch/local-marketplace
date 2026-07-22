import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PageSectionRecord, PageSectionType } from "@/lib/pageStudio/registry";

type PageSectionRow = {
  id: string;
  page_key: string;
  section_key: string;
  section_type: PageSectionType;
  draft_position: number;
  published_position: number;
  is_required: boolean;
  draft_config: Record<string, unknown>;
  published_config: Record<string, unknown>;
  draft_visible: boolean;
  published_visible: boolean;
  updated_at: string;
  published_at: string | null;
};

export type PageVersionRecord = {
  id: string;
  pageKey: string;
  version: number;
  snapshot: unknown;
  createdAt: string;
  createdBy: string | null;
};

const SECTION_BASE_COLUMNS = [
  "id",
  "page_key",
  "section_key",
  "section_type",
  "is_required",
  "updated_at",
  "published_at",
];

function toSection(row: PageSectionRow, mode: "draft" | "published"): PageSectionRecord {
  return {
    id: row.id,
    pageKey: row.page_key,
    sectionKey: row.section_key,
    sectionType: row.section_type,
    position: mode === "draft" ? row.draft_position : row.published_position,
    isRequired: row.is_required,
    config: mode === "draft" ? row.draft_config : row.published_config,
    visible: mode === "draft" ? row.draft_visible : row.published_visible,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
  };
}

async function readSections(pageKey: string, mode: "draft" | "published") {
  const orderColumn = mode === "draft" ? "draft_position" : "published_position";
  const modeColumns = mode === "draft"
    ? ["draft_position", "draft_config", "draft_visible"]
    : ["published_position", "published_config", "published_visible"];
  const { data, error } = await supabaseAdmin
    .from("page_sections")
    .select([...SECTION_BASE_COLUMNS, ...modeColumns].join(","))
    .eq("page_key", pageKey)
    .order(orderColumn, { ascending: true });

  if (error) throw new Error(`getPageSections(${pageKey}, ${mode}) failed: ${error.message}`);
  return (data as unknown as PageSectionRow[]).map((row) => toSection(row, mode));
}

/** Server-only published view. Never selects draft fields into a browser client. */
export async function getPublishedPageSections(pageKey: string): Promise<PageSectionRecord[]> {
  const sections = await readSections(pageKey, "published");
  return sections.filter((section) => section.visible);
}

/** Manager-only callers must enforce authorization before using this function. */
export async function getDraftPageSections(pageKey: string): Promise<PageSectionRecord[]> {
  return readSections(pageKey, "draft");
}

/** Manager-only version history; page_versions has no public RLS policy. */
export async function getPageVersions(pageKey: string, limit = 20): Promise<PageVersionRecord[]> {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const { data, error } = await supabaseAdmin
    .from("page_versions")
    .select("id, page_key, version, snapshot, created_at, created_by")
    .eq("page_key", pageKey)
    .order("version", { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`getPageVersions(${pageKey}) failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    pageKey: row.page_key as string,
    version: row.version as number,
    snapshot: row.snapshot,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as string | null) ?? null,
  }));
}
