import { emailShell } from "@/lib/email/templates/shared";
import { formatPrice } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";

export function priceDropEmail(product: {
  productId: string;
  productName: string;
  image: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
  currency: "USD" | "EGP";
}): { subject: string; html: string } {
  const url = absoluteUrl(`/product/${product.productId}`);
  const percent = Math.round(product.discountPercent);
  return {
    subject: `${percent}% off ${product.productName} — it's on your wishlist`,
    html: emailShell(`
      <h1 style="font-size: 18px; margin: 0 0 8px;">A price drop on something you saved</h1>
      <p style="font-size: 14px; color: #4a463c; margin: 0 0 20px;">
        ${product.productName} just dropped ${percent}% — don't wait too long, pieces like this from
        independent local brands tend to sell out fast.
      </p>
      <img src="${product.image}" alt="${product.productName}" style="width: 100%; max-width: 280px; border-radius: 12px; display: block; margin: 0 0 16px;" />
      <p style="margin: 0 0 4px;">
        <span style="font-size: 20px; font-weight: 700;">${formatPrice(product.discountedPrice, product.currency)}</span>
        <span style="font-size: 14px; font-weight: 400; color: #8a8578; text-decoration: line-through; margin-left: 8px;">${formatPrice(product.originalPrice, product.currency)}</span>
      </p>
      <a href="${url}" style="display: inline-block; margin-top: 16px; background: #C85956; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 14px; font-weight: 600;">
        Grab it before it's gone
      </a>
    `),
  };
}
