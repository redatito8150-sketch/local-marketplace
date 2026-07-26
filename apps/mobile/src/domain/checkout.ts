export function validateCheckoutInput(itemCount: number, shipping: Record<string, string>) {
  if (itemCount < 1) return "Your cart is empty.";
  if (Object.values(shipping).some((value) => !value.trim())) {
    return "Complete all delivery fields before placing your order.";
  }
  return null;
}
