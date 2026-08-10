import { emailShell } from "@/lib/email/templates/shared";
import { absoluteUrl } from "@/lib/seo";

export function backInStockEmail(product: {
  productId: string;
  productName: string;
  image: string;
  variantLabel: string;
}): { subject: string; html: string } {
  const url = absoluteUrl(`/product/${product.productId}`);
  return {
    subject: `${product.productName} is back in stock`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">Good news — it's back!</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        ${product.productName}${product.variantLabel ? ` (${product.variantLabel})` : ""} is available again.
        Stock moves fast on restocks, so don't wait too long.
      </p>
      <img src="${product.image}" alt="${product.productName}" style="width: 100%; max-width: 280px; border-radius: 12px; display: block; margin: 0 0 20px;" />
      <a href="${url}" style="display: inline-block; background: #AC3935; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Shop it now
      </a>
    `),
  };
}
