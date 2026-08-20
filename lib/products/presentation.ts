import { draftDaysRemaining } from "@/lib/admin/expireDrafts";
import { isPublishDateLive } from "@/lib/newArrivals";
import type { ProductStatus } from "@/types";

export type ProductBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export type ProductPresentationInput = {
  status?: ProductStatus;
  publishDate?: string;
  draftStartedAt?: string;
  launchPolicy?: "show_now" | "when_stocked";
  firstStockedAt?: string;
  inStock?: boolean;
};

export type ProductStatusPresentation = {
  lifecycle: { label: string; tone: ProductBadgeTone };
  visibility?: { label: string; tone: ProductBadgeTone };
  canShowNow: boolean;
};

function formatSchedule(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getProductStatusPresentation(product: ProductPresentationInput): ProductStatusPresentation {
  const status = product.status ?? "draft";

  if (status === "draft") {
    const daysLeft = draftDaysRemaining(product.draftStartedAt);
    return {
      lifecycle: {
        label: daysLeft == null ? "Draft" : `Draft · ${Math.max(daysLeft, 0)}d left`,
        tone: daysLeft != null && daysLeft <= 3 ? "danger" : "warning",
      },
      canShowNow: false,
    };
  }

  if (status === "pending_review") {
    return { lifecycle: { label: "Pending Review", tone: "warning" }, canShowNow: false };
  }

  if (status === "changes_requested") {
    return { lifecycle: { label: "Changes Requested", tone: "danger" }, canShowNow: false };
  }

  if (status === "archived") {
    return { lifecycle: { label: "Archived", tone: "neutral" }, canShowNow: false };
  }

  if (status === "paused") {
    return {
      lifecycle: { label: "Paused", tone: "neutral" },
      visibility: { label: "Hidden from customers", tone: "neutral" },
      canShowNow: false,
    };
  }

  if (product.publishDate && !isPublishDateLive(product.publishDate)) {
    return {
      lifecycle: { label: `Scheduled · ${formatSchedule(product.publishDate)}`, tone: "info" },
      canShowNow: false,
    };
  }

  if (product.launchPolicy === "when_stocked" && !product.firstStockedAt) {
    return {
      lifecycle: { label: "Published", tone: "success" },
      visibility: { label: "Waiting for stock", tone: "warning" },
      canShowNow: true,
    };
  }

  return {
    lifecycle: { label: "Published", tone: "success" },
    visibility: product.inStock
      ? { label: "Visible · in stock", tone: "success" }
      : { label: "Visible · out of stock", tone: "neutral" },
    canShowNow: false,
  };
}
