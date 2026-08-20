import "server-only";

import { getBrandMembersForAdmin } from "@/lib/data/admin";
import { logError } from "@/lib/errorLog";
import { notifyUser } from "@/lib/notify";

export async function notifyBrandOwnersOfProductLifecycle(args: {
  brandSlug?: string | null;
  productId: string;
  type: string;
  title: string;
  body: string;
  deliveryToken: string;
  excludeUserId?: string | null;
}) {
  if (!args.brandSlug) return;
  try {
    const members = await getBrandMembersForAdmin(args.brandSlug);
    await Promise.all((members?.owners ?? [])
      .filter((owner) => owner.id !== args.excludeUserId)
      .map((owner) => notifyUser(owner.id, args.type, args.title, args.body, {
        relatedEntityType: "product",
        relatedEntityId: args.productId,
        deliveryKey: `product-lifecycle:${args.productId}:${args.deliveryToken}:${owner.id}`,
      })));
  } catch (error) {
    logError(
      `notifyBrandOwnersOfProductLifecycle(${args.productId}) failed`,
      error instanceof Error ? error.message : String(error)
    );
  }
}
