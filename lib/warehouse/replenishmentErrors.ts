// Stable, machine-readable error codes for the partner replenishment
// request flow (request_warehouse_transfer, brand_portal_replenishment_variants
// in supabase/migrations/20260814010500_partner_replenishment_request.sql,
// and this flow's own routes). A Postgres RPC in this codebase always
// raises a short SCREAMING_SNAKE_CASE literal (optionally followed by
// `: <detail>`, e.g. 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %') — this is an
// ALLOWLIST match against that literal, never a blind pass-through of the
// raw Postgres message, so a caller can build reliable UI branching (a
// disabled button, a specific inline message) without ever seeing internal
// schema/constraint text. Anything that doesn't match a known code falls
// back to a generic, safe response.
//
// Deliberately has ZERO import-time dependency on next/server (unlike
// lib/warehouse/replenishmentErrorResponse.ts, which wraps this in a
// NextResponse) — this repo's Next.js route runtime can't be constructed
// under plain `node --test`, so every route module is verified via
// source-text regex only (see tests/warehouseLedgerAndDocuments.test.ts and
// friends). This module's pure resolveReplenishmentError is the one piece
// of this error-handling logic that's actually, fully unit-tested.
const REPLENISHMENT_ERROR_MESSAGES: Record<string, string> = {
  INVALID_OPERATION_KEY: "A valid Idempotency-Key header is required.",
  TRANSFER_ITEMS_REQUIRED: "Select at least one variant to request.",
  DUPLICATE_OR_INVALID_VARIANT: "Each variant can appear only once in a request.",
  INVALID_REQUESTED_QUANTITY: "Quantity must be a whole, positive number.",
  INVALID_UNIT_COST: "Unit cost cannot be negative.",
  BRAND_NOT_FOUND: "We couldn't find your brand.",
  FULFILLMENT_TRANSITION_IN_PROGRESS:
    "Replenishment requests are paused while your fulfillment setup is changing.",
  BRAND_NOT_PARTNER: "This brand isn't set up for Zakhnook-fulfilled replenishment.",
  IDEMPOTENCY_CONFLICT: "This request was already submitted with different details.",
  VARIANT_NOT_FOUND_FOR_BRAND: "One or more variants don't belong to your brand.",
  VARIANT_NOT_ACTIVE_FOR_BRAND: "One or more variants are archived or inactive and can't be replenished.",
  INSUFFICIENT_BRAND_STOCK: "The requested quantity exceeds what's available to ship for this transition.",
  MANUAL_STOCK_OVERWRITE_DISABLED:
    "Manually editing warehouse stock is no longer supported — submit a replenishment request instead.",
  BRAND_ID_REQUIRED: "A brand is required.",
  INVALID_STOCK_STATUS_FILTER: "That stock status filter isn't valid.",
  INVALID_SORT: "That sort option isn't valid.",
  INVALID_CURSOR: "That page reference isn't valid — start from the first page again.",
};

const REPLENISHMENT_ERROR_STATUS: Record<string, number> = {
  INVALID_OPERATION_KEY: 400,
  TRANSFER_ITEMS_REQUIRED: 400,
  DUPLICATE_OR_INVALID_VARIANT: 400,
  INVALID_REQUESTED_QUANTITY: 400,
  INVALID_UNIT_COST: 400,
  BRAND_NOT_FOUND: 404,
  FULFILLMENT_TRANSITION_IN_PROGRESS: 409,
  BRAND_NOT_PARTNER: 403,
  IDEMPOTENCY_CONFLICT: 409,
  VARIANT_NOT_FOUND_FOR_BRAND: 400,
  VARIANT_NOT_ACTIVE_FOR_BRAND: 400,
  INSUFFICIENT_BRAND_STOCK: 409,
  MANUAL_STOCK_OVERWRITE_DISABLED: 410,
  BRAND_ID_REQUIRED: 400,
  INVALID_STOCK_STATUS_FILTER: 400,
  INVALID_SORT: 400,
  INVALID_CURSOR: 400,
};

const UNEXPECTED_CODE = "UNEXPECTED_ERROR";
const UNEXPECTED_MESSAGE = "Something went wrong. Please try again.";

// Matches a leading SCREAMING_SNAKE_CASE token up to an optional `: detail`
// suffix or end of string — the exact shape every raise exception literal
// in this flow's RPCs uses.
const CODE_PATTERN = /^([A-Z][A-Z0-9_]*)(?::|$)/;

export interface ResolvedReplenishmentError {
  code: string;
  userMessage: string;
  status: number;
  isKnown: boolean;
}

export function resolveReplenishmentError(message: string): ResolvedReplenishmentError {
  const match = CODE_PATTERN.exec(message);
  const candidate = match?.[1];
  const isKnown = candidate !== undefined && Object.hasOwn(REPLENISHMENT_ERROR_MESSAGES, candidate);
  const code = isKnown ? candidate : UNEXPECTED_CODE;
  return {
    code,
    userMessage: isKnown ? REPLENISHMENT_ERROR_MESSAGES[code] : UNEXPECTED_MESSAGE,
    status: isKnown ? REPLENISHMENT_ERROR_STATUS[code] : 500,
    isKnown,
  };
}
