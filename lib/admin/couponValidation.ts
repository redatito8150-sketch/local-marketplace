import type { CouponDiscountType } from "@/types";

export interface CouponInput {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses?: number;
  expiresAt?: string;
  active: boolean;
}

const CODE_PATTERN = /^[A-Z0-9_-]+$/;

export function validateCouponInput(body: CouponInput): string | null {
  if (!body.code?.trim() || !CODE_PATTERN.test(body.code.trim().toUpperCase())) {
    return "Code is required and must be letters, numbers, hyphens, or underscores only";
  }
  if (body.discountType !== "percentage" && body.discountType !== "fixed") {
    return "Discount type must be percentage or fixed";
  }
  if (!Number.isFinite(body.discountValue) || body.discountValue <= 0) {
    return "Discount value must be a positive number";
  }
  if (body.discountType === "percentage" && body.discountValue > 100) {
    return "A percentage discount can't exceed 100";
  }
  if (body.maxUses != null && (!Number.isInteger(body.maxUses) || body.maxUses < 1)) {
    return "Max uses must be a positive whole number, or left blank for unlimited";
  }
  return null;
}
