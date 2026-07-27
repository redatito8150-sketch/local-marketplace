"use client";

import { useMemo, useState } from "react";
import type { TaxonomyNode } from "@/types";

// Cascading Main Category -> Product Group -> Product Type selects, backed
// entirely by the DB-driven taxonomy tree (lib/data/taxonomy.ts) — no
// hierarchy is hardcoded here. Main/Group selection is derived from
// `value` (the chosen Product Type's id) whenever possible, with local
// state only for the in-progress steps before a leaf is actually picked
// (Main/Group chosen but no Product Type yet, so there's no `value` to
// derive them from).
export default function TaxonomySelector({
  nodes,
  value,
  onChange,
  legacyCategory,
  legacyType,
}: {
  nodes: TaxonomyNode[];
  value: string;
  onChange: (productTypeId: string) => void;
  // Shown as read-only context when this product's existing category
  // predates the new taxonomy (or belongs to a Main Category not seeded
  // into it yet) and no matching leaf could be resolved — so an admin/brand
  // editing an older product can see what's still stored instead of the
  // selects just looking silently empty.
  legacyCategory?: string;
  legacyType?: string;
}) {
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selectedType = value ? byId.get(value) : undefined;
  const derivedGroupId = selectedType?.parentId ?? "";
  const derivedMainId = derivedGroupId ? byId.get(derivedGroupId)?.parentId ?? "" : "";

  const [mainId, setMainId] = useState(derivedMainId);
  const [groupId, setGroupId] = useState(derivedGroupId);

  // Re-sync the two in-progress selections whenever the external value
  // changes (switching products in edit mode, or a parent-level "clear") —
  // adjusted during render rather than in an effect, guarded so it only
  // fires on an actual change.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setMainId(derivedMainId);
    setGroupId(derivedGroupId);
  }

  const mainOptions = useMemo(() => nodes.filter((node) => node.level === 1), [nodes]);
  const groupOptions = useMemo(
    () => nodes.filter((node) => node.level === 2 && node.parentId === mainId),
    [nodes, mainId]
  );
  const typeOptions = useMemo(
    () => nodes.filter((node) => node.level === 3 && node.parentId === groupId),
    [nodes, groupId]
  );

  const handleMainChange = (nextMainId: string) => {
    setMainId(nextMainId);
    setGroupId("");
    if (value) onChange("");
  };

  const handleGroupChange = (nextGroupId: string) => {
    setGroupId(nextGroupId);
    if (value) onChange("");
  };

  const showLegacyNotice = !value && !mainId && Boolean(legacyCategory || legacyType);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TaxonomyField
          label="Main Category"
          required
          value={mainId}
          onChange={handleMainChange}
          placeholder="Select main category"
          options={mainOptions}
        />
        <TaxonomyField
          label="Product Group"
          required
          value={groupId}
          onChange={handleGroupChange}
          placeholder="Select product group"
          options={groupOptions}
          disabled={!mainId}
        />
        <TaxonomyField
          label="Product Type"
          required
          value={value}
          onChange={onChange}
          placeholder="Select product type"
          options={typeOptions}
          disabled={!groupId}
        />
      </div>
      {showLegacyNotice && (
        <p className="mt-2 text-[11.5px] text-ink-soft/50">
          Currently stored as &quot;{legacyCategory}
          {legacyType ? ` / ${legacyType}` : ""}&quot; — not yet part of the new taxonomy. Leave
          unset to keep it as-is, or pick a Main Category above to move this product into the new
          structure.
        </p>
      )}
    </div>
  );
}

function TaxonomyField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: TaxonomyNode[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink-soft/70">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-stone-150 bg-white px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-ink/30 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-ink-soft/40"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
