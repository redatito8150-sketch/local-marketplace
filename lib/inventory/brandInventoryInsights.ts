export function estimateDaysRemaining(quantity: number, soldLast30Days: number): number | null {
  if (soldLast30Days <= 0) return null;
  return Math.max(0, Math.round((quantity / (soldLast30Days / 30)) * 10) / 10);
}

export function suggestedRestockQuantity(
  quantity: number,
  lowStockThreshold: number,
  soldLast30Days: number
): number {
  const thirtyDayDemandWithBuffer = soldLast30Days + lowStockThreshold;
  const minimumHealthyTarget = lowStockThreshold * 2;
  return Math.max(0, Math.ceil(Math.max(thirtyDayDemandWithBuffer, minimumHealthyTarget) - quantity));
}

export function inventoryRiskScore(input: {
  quantity: number;
  lowStockThreshold: number;
  soldLast30Days: number;
}): number {
  if (input.quantity <= 0) return Number.NEGATIVE_INFINITY;
  const daysRemaining = estimateDaysRemaining(input.quantity, input.soldLast30Days);
  if (daysRemaining != null) return daysRemaining;
  return input.quantity <= input.lowStockThreshold ? 10_000 + input.quantity : 20_000 + input.quantity;
}
