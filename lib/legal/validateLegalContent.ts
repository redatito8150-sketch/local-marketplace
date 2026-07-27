// Pure, dependency-light placeholder scanner — deliberately takes its
// content as parameters (rather than importing content/legal/*.ts itself)
// so it's trivially unit-testable with synthetic fixtures. See
// legalContentStatus.ts for the entry point that wires this up against the
// real /privacy and /terms content.
//
// Uses relative imports only (never the "@/" path alias) because this
// module is imported both by the Next.js app (where the alias resolves)
// and by scripts/validate-legal-content.mjs, a plain Node script that runs
// outside Next's bundler and can't resolve "@/" — see that script for why
// this file exists as a separate build-time gate rather than living inside
// next.config.js.
import { isUnresolvedPlaceholder } from "../../config/legal.ts";
import type { LegalSection } from "../../types/index.ts";

export interface LegalContentSource {
  sections?: LegalSection[];
  strings?: string[];
}

function tokensIn(text: string): string[] {
  return text.match(/\[[^[\]]+\]/g) ?? [];
}

function tokensInSections(sections: LegalSection[]): string[] {
  const tokens: string[] = [];
  for (const section of sections) {
    for (const block of section.body) {
      if (block.type === "list") {
        for (const item of block.items) tokens.push(...tokensIn(item));
      } else {
        tokens.push(...tokensIn(block.text));
      }
    }
  }
  return tokens;
}

export function findUnresolvedPlaceholders(sources: LegalContentSource[]): string[] {
  const tokens: string[] = [];
  for (const source of sources) {
    if (source.sections) tokens.push(...tokensInSections(source.sections));
    if (source.strings) for (const value of source.strings) tokens.push(...tokensIn(value));
  }
  const unresolved = tokens.filter(isUnresolvedPlaceholder);
  return Array.from(new Set(unresolved)).sort();
}

export class UnresolvedLegalPlaceholdersError extends Error {
  placeholders: string[];

  constructor(placeholders: string[]) {
    super(
      `${placeholders.length} unresolved legal placeholder(s) found: ${placeholders.join(", ")}. ` +
        "Production builds refuse to ship a legal page with unconfirmed placeholders — fill in " +
        "real values (config/legal.ts, or directly in content/legal/*.ts for the two one-off " +
        "review-flag tokens) before deploying. See docs/legal-placeholders-todo.md."
    );
    this.name = "UnresolvedLegalPlaceholdersError";
    this.placeholders = placeholders;
  }
}

export function assertNoUnresolvedPlaceholders(sources: LegalContentSource[]): void {
  const unresolved = findUnresolvedPlaceholders(sources);
  if (unresolved.length > 0) throw new UnresolvedLegalPlaceholdersError(unresolved);
}
