export const MAX_ORDER_BODY_BYTES = 32 * 1024;
export const MAX_ORDER_LINES = 20;
export const MAX_ITEM_QUANTITY = 10;
export const MAX_TOTAL_QUANTITY = 30;

export interface ValidatedOrderItem {
  productId: string;
  size: string;
  color?: string;
  quantity: number;
}

export interface ValidatedShipping {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  governorate: string;
}

export interface ValidatedOrderRequest {
  items: ValidatedOrderItem[];
  shipping: ValidatedShipping;
  couponCode?: string;
  addressId?: string;
}

type ValidationResult =
  | { ok: true; value: ValidatedOrderRequest }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  label: string,
  maxLength: number
): { value?: string; error?: string } {
  if (typeof value !== "string" || !value.trim()) return { error: `${label} is required` };
  const normalized = value.trim();
  if (normalized.length > maxLength) return { error: `${label} is too long` };
  return { value: normalized };
}

export function validateOrderRequest(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, error: "Invalid request body" };
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Cart is empty" };
  }
  if (input.items.length > MAX_ORDER_LINES) {
    return { ok: false, error: `An order can contain at most ${MAX_ORDER_LINES} items` };
  }

  const items: ValidatedOrderItem[] = [];
  const selections = new Set<string>();
  let totalQuantity = 0;

  for (const rawItem of input.items) {
    if (!isRecord(rawItem)) return { ok: false, error: "Invalid cart item" };
    const productId = requiredText(rawItem.productId, "Product", 160);
    const size = requiredText(rawItem.size, "Size", 80);
    if (productId.error || size.error) {
      return { ok: false, error: productId.error ?? size.error ?? "Invalid cart item" };
    }
    if (!Number.isInteger(rawItem.quantity) || Number(rawItem.quantity) < 1) {
      return { ok: false, error: "Item quantity must be a positive whole number" };
    }
    const quantity = Number(rawItem.quantity);
    if (quantity > MAX_ITEM_QUANTITY) {
      return { ok: false, error: `Item quantity cannot exceed ${MAX_ITEM_QUANTITY}` };
    }
    const color =
      typeof rawItem.color === "string" && rawItem.color.trim()
        ? rawItem.color.trim().slice(0, 80)
        : undefined;
    const selectionKey = `${productId.value}\u0000${size.value}\u0000${color ?? ""}`;
    if (selections.has(selectionKey)) {
      return { ok: false, error: "Duplicate cart selections must be combined" };
    }
    selections.add(selectionKey);
    totalQuantity += quantity;
    items.push({ productId: productId.value!, size: size.value!, color, quantity });
  }

  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    return { ok: false, error: `An order cannot exceed ${MAX_TOTAL_QUANTITY} units` };
  }
  if (!isRecord(input.shipping)) return { ok: false, error: "Shipping details are required" };

  const shippingFields = {
    firstName: requiredText(input.shipping.firstName, "First name", 80),
    lastName: requiredText(input.shipping.lastName, "Last name", 80),
    email: requiredText(input.shipping.email, "Email", 254),
    phone: requiredText(input.shipping.phone, "Phone", 40),
    address: requiredText(input.shipping.address, "Address", 300),
    city: requiredText(input.shipping.city, "City", 100),
    governorate: requiredText(input.shipping.governorate, "Governorate", 100),
  };
  for (const field of Object.values(shippingFields)) {
    if (field.error) return { ok: false, error: field.error };
  }
  const email = shippingFields.email.value!;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address" };
  }

  let couponCode: string | undefined;
  if (input.couponCode != null && input.couponCode !== "") {
    if (typeof input.couponCode !== "string" || input.couponCode.trim().length > 50) {
      return { ok: false, error: "Invalid coupon code" };
    }
    couponCode = input.couponCode.trim().toUpperCase();
  }

  let addressId: string | undefined;
  if (input.addressId != null && input.addressId !== "") {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof input.addressId !== "string" || !UUID_RE.test(input.addressId)) {
      return { ok: false, error: "Invalid address selection" };
    }
    addressId = input.addressId;
  }

  return {
    ok: true,
    value: {
      items,
      shipping: {
        firstName: shippingFields.firstName.value!,
        lastName: shippingFields.lastName.value!,
        email,
        phone: shippingFields.phone.value!,
        address: shippingFields.address.value!,
        city: shippingFields.city.value!,
        governorate: shippingFields.governorate.value!,
      },
      couponCode,
      addressId,
    },
  };
}
