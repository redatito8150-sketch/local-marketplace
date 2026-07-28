"use client";

import { useMemo } from "react";
import { buildComboKey } from "@/lib/inventory/variantCombinations";
import { variantChangeSummary } from "@/lib/inventory/allowedCombinations";

interface Choice {
  id: string;
  label: string;
}

export default function AllowedCombinationBuilder({
  groups,
  allowed,
  existing,
  onChange,
  disabled,
}: {
  groups: { id: string; label: string; values: Choice[] }[];
  allowed: string[][];
  existing: { optionValueIds: string[]; quantity?: number }[];
  onChange: (next: string[][]) => void;
  disabled?: boolean;
}) {
  const selected = useMemo(() => new Set(allowed.map(buildComboKey)), [allowed]);
  const summary = useMemo(() => variantChangeSummary(existing, allowed), [existing, allowed]);

  const toggle = (ids: string[], force?: boolean) => {
    const key = buildComboKey(ids);
    const include = force ?? !selected.has(key);
    onChange(include ? [...allowed, ids] : allowed.filter((combo) => buildComboKey(combo) !== key));
  };

  if (groups.length === 0) return <p className="text-[12px] text-ink-soft/55">One default variant will be used.</p>;

  if (groups.length === 1) {
    return (
      <section aria-label="Allowed combinations" className="space-y-2">
        <CombinationHeader count={allowed.length} summary={summary} />
        <div className="flex flex-wrap gap-2">
          {groups[0].values.map((choice) => (
            <Toggle key={choice.id} checked={selected.has(buildComboKey([choice.id]))} label={choice.label} onClick={() => toggle([choice.id])} disabled={disabled} />
          ))}
        </div>
      </section>
    );
  }

  const [rows, columns, third] = groups;
  const candidatesFor = (rowId: string, columnId: string) =>
    third ? third.values.map((choice) => [rowId, columnId, choice.id]) : [[rowId, columnId]];
  const rowCandidates = (rowId: string) => columns.values.flatMap((column) => candidatesFor(rowId, column.id));
  const columnCandidates = (columnId: string) => rows.values.flatMap((row) => candidatesFor(row.id, columnId));
  const setMany = (candidates: string[][], include: boolean) => {
    const keys = new Set(candidates.map(buildComboKey));
    const retained = allowed.filter((combo) => !keys.has(buildComboKey(combo)));
    onChange(include ? [...retained, ...candidates] : retained);
  };

  return (
    <section aria-label="Allowed combinations" className="space-y-3">
      <CombinationHeader count={allowed.length} summary={summary} />
      <div className="flex flex-wrap gap-2 text-[11.5px]">
        <button type="button" onClick={() => setMany(rows.values.flatMap((r) => rowCandidates(r.id)), true)} className="rounded border px-2 py-1">Select All</button>
        <button type="button" onClick={() => onChange([])} className="rounded border px-2 py-1">Clear All</button>
      </div>
      <div className="max-w-full overflow-x-auto rounded-lg border border-stone-150">
        <table className="min-w-max border-collapse text-[12px]">
          <thead>
            <tr className="bg-stone-50">
              <th className="sticky left-0 z-20 bg-stone-50 p-2 text-left">{rows.label} / {columns.label}</th>
              {columns.values.map((column) => (
                <th key={column.id} className="p-2">
                  <div>{column.label}</div>
                  <div className="mt-1 flex gap-1">
                    <button type="button" aria-label={`Select ${column.label} column`} onClick={() => setMany(columnCandidates(column.id), true)}>All</button>
                    <span>/</span>
                    <button type="button" aria-label={`Clear ${column.label} column`} onClick={() => setMany(columnCandidates(column.id), false)}>None</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.values.map((row) => (
              <tr key={row.id} className="border-t border-stone-150">
                <th className="sticky left-0 z-10 bg-white p-2 text-left">
                  <div>{row.label}</div>
                  <div className="mt-1 flex gap-1 font-normal">
                    <button type="button" onClick={() => setMany(rowCandidates(row.id), true)}>All</button>
                    <span>/</span>
                    <button type="button" onClick={() => setMany(rowCandidates(row.id), false)}>None</button>
                    <span>/</span>
                    <button type="button" onClick={() => {
                      const candidates = rowCandidates(row.id);
                      const next = new Set(selected);
                      for (const combo of candidates) {
                        const key = buildComboKey(combo);
                        if (next.has(key)) next.delete(key); else next.add(key);
                      }
                      onChange([...next].map((key) => key ? key.split(",") : []));
                    }}>Invert</button>
                  </div>
                </th>
                {columns.values.map((column) => (
                  <td key={column.id} className="p-2 align-top">
                    <div className="flex min-w-20 flex-wrap gap-1">
                      {candidatesFor(row.id, column.id).map((ids, index) => {
                        const label = third?.values[index]?.label ?? "Allowed";
                        return <Toggle key={buildComboKey(ids)} checked={selected.has(buildComboKey(ids))} label={label} onClick={() => toggle(ids)} disabled={disabled} />;
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-ink-soft/55">New values start unselected. Desktop and narrow layouts edit the same explicit combination set.</p>
    </section>
  );
}

function Toggle({ checked, label, onClick, disabled }: { checked: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={onClick} className={`rounded border px-2 py-1 ${checked ? "border-ink bg-ink text-cream" : "border-stone-200 bg-white"}`}>{checked ? "✓ " : ""}{label}</button>;
}

function CombinationHeader({ count, summary }: { count: number; summary: ReturnType<typeof variantChangeSummary> }) {
  return (
    <div className="rounded-md bg-stone-50 p-3 text-[12px]">
      <strong>{count} variant{count === 1 ? "" : "s"} selected</strong>
      <p className="mt-1 text-ink-soft/65">{summary.preserved} preserved · {summary.created} new · {summary.removed} removed · {summary.affectedQuantity} inventory units affected</p>
    </div>
  );
}
