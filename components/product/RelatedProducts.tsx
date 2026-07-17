import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import StarRating from "@/components/shared/StarRating";

interface RelatedProductCard {
  id: string;
  name: string;
  brand: string;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  rating: number;
  reviewCount: number;
}

export default function RelatedProducts({
  products,
}: {
  products: RelatedProductCard[];
}) {
  if (products.length === 0) return null;

  return (
    <section className="border-t border-stone-150 pt-12">
      <h2 className="text-2xl font-bold tracking-tightest text-ink">
        You May Also Like
      </h2>

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
        {products.map((product) => (
          <Link key={product.id} href={`/product/${product.id}`} className="group">
            <div className="relative aspect-[3/3.9] w-full overflow-hidden rounded-[16px] bg-beige-50">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="mt-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft/50">
                {product.brand}
              </p>
              <h3 className="mt-1 text-[14px] font-medium leading-snug text-ink">
                {product.name}
              </h3>
              <p className="mt-1.5 text-[14px] font-semibold text-ink">
                {formatPrice(product.price, product.currency)}
              </p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <StarRating rating={product.rating} size="xs" />
                <span className="text-[12px] text-ink-soft/45">
                  ({product.reviewCount})
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
