import { formatPrice } from "@/lib/format";

type Json = Record<string, unknown> | null | undefined;

function asRecord(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : null;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

const SITE_CONTENT_LABELS: Record<string, string> = {
  home_hero: "Homepage Hero",
  join_hero: "Join as a Brand page",
  category_heroes: "Category Heroes",
  journal_articles: "Journal",
  product_taxonomy: "Product Categories",
  shipping_settings: "Shipping Settings",
  contact_info: "Contact Info",
};

function siteContentLabel(entityId: string): string {
  const key = entityId.split(":")[0];
  return SITE_CONTENT_LABELS[key] ?? key;
}

const ACCESS_LABELS: Record<string, string> = {
  customer: "Customer",
  brand_owner: "Brand Owner",
  brand_assistant: "Brand Assistant",
  staff: "Staff",
  manager: "Manager",
  admin: "Admin",
};

interface AuditLogLike {
  actorLabel: string;
  actorName?: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeValue: unknown;
  afterValue: unknown;
}

// Turns a raw audit_logs row into a sentence, instead of the entity-type
// badge + action-code label the log used to show. Every case here is built
// from the actual before/after shapes each write route logs (verified by
// direct read — see the Round 2 plan's architecture notes) rather than a
// generic key-diff, since `before` (a DB row, snake_case) and `after` (often
// a request body, camelCase) don't line up automatically for most fields.
export function describeAuditLog(log: AuditLogLike): string {
  const actor = log.actorName || log.actorLabel;
  const before = asRecord(log.beforeValue);
  const after = asRecord(log.afterValue);

  switch (log.entityType) {
    case "product": {
      const name = (after?.name as string) || (before?.name as string) || log.entityId;
      if (log.action === "create") return `${actor} created the product "${name}".`;
      if (log.action === "delete" || log.action === "bulk_delete")
        return `${actor} deleted the product "${name}".`;
      if (log.action === "bulk_publish") return `${actor} published "${name}" (bulk update).`;
      if (log.action === "bulk_archive") return `${actor} archived "${name}" (bulk update).`;
      if (log.action === "pause") return `${actor} paused "${name}" from the storefront.`;
      if (log.action === "unpause") return `${actor} unpaused "${name}" — it's back on the storefront.`;
      if (log.action === "request_deletion") return `${actor} requested deletion of "${name}".`;
      if (log.action === "approve")
        return before?.status === "published"
          ? `${actor} approved an edit to "${name}".`
          : `${actor} approved and published "${name}".`;
      if (log.action === "request_changes") {
        const notes = after?.notes as string | undefined;
        return notes
          ? `${actor} requested changes on "${name}": "${notes}"`
          : `${actor} requested changes on "${name}".`;
      }
      if (log.action === "reject_deletion") return `${actor} rejected the deletion request for "${name}".`;
      if (log.action === "status_change" && before?.status && after?.status)
        return `${actor} changed "${name}"'s status from ${before.status} to ${after.status}.`;
      if (before?.name && after?.name && before.name !== after.name)
        return `${actor} renamed the product from "${before.name}" to "${after.name}".`;
      if (
        before?.price != null &&
        after?.price != null &&
        Number(before.price) !== Number(after.price)
      )
        return `${actor} changed the price of "${name}" from ${formatPrice(
          Number(before.price),
          "EGP"
        )} to ${formatPrice(Number(after.price), "EGP")}.`;
      return `${actor} updated the product "${name}".`;
    }

    case "brand": {
      const name = (after?.name as string) || (before?.name as string) || log.entityId;
      if (log.action === "create") return `${actor} created the brand "${name}".`;
      if (log.action === "delete") return `${actor} deleted the brand "${name}".`;
      if (after && "ownerUserId" in after) {
        return after.ownerUserId
          ? `${actor} linked ${name}'s brand portal to ${after.ownerEmail ?? "an account"}.`
          : `${actor} unlinked ${name}'s brand portal access.`;
      }
      if (before?.name && after?.name && before.name !== after.name)
        return `${actor} renamed the brand from "${before.name}" to "${after.name}".`;
      return `${actor} updated the brand "${name}".`;
    }

    case "order": {
      const id = `#${shortId(log.entityId)}`;
      if (log.action === "status_change" && before?.status && after?.status)
        return `${actor} changed order ${id}'s status from ${before.status} to ${after.status}.`;
      if (after && "internalNotes" in after) return `${actor} added an internal note to order ${id}.`;
      return `${actor} updated order ${id}.`;
    }

    case "application": {
      const id = `#${shortId(log.entityId)}`;
      if (log.action === "status_change" && before?.status && after?.status)
        return `${actor} changed application ${id}'s status from ${before.status} to ${after.status}.`;
      return `${actor} updated application ${id}.`;
    }

    case "profile": {
      const email = (before?.email as string) || `account #${shortId(log.entityId)}`;
      if (after?.access) {
        const label = ACCESS_LABELS[after.access as string] ?? String(after.access);
        const brandNote =
          (after.access === "brand_owner" || after.access === "brand_assistant") && after.brandSlug
            ? ` (linked to ${after.brandSlug})`
            : "";
        return `${actor} set ${email}'s access to ${label}${brandNote}.`;
      }
      if (after?.role && before?.role && after.role !== before.role)
        return `${actor} changed ${email}'s role from ${before.role} to ${after.role}.`;
      if (typeof after?.is_admin === "boolean")
        return `${actor} ${after.is_admin ? "granted" : "revoked"} admin access for ${email}.`;
      return `${actor} updated ${email}'s account.`;
    }

    case "coupon": {
      const code = log.entityId;
      if (log.action === "create") return `${actor} created coupon "${code}".`;
      if (log.action === "delete") return `${actor} deleted coupon "${code}".`;
      return `${actor} updated coupon "${code}".`;
    }

    case "site_content": {
      const label = siteContentLabel(log.entityId);
      if (log.action === "delete") return `${actor} reset the ${label} content to default.`;
      if (log.action === "create") return `${actor} customized the ${label} content.`;
      return `${actor} updated the ${label} content.`;
    }

    default:
      return `${actor} ${log.action.replace(/_/g, " ")} this ${log.entityType}.`;
  }
}
