import Image from "next/image";
import Link from "next/link";
import { SimilarBrand } from "@/types";

export default function SimilarBrands({ brands }: { brands: SimilarBrand[] }) {
  return (
    <section className="mx-auto max-w-brand px-6 py-24 lg:px-10 lg:py-32">
      <h2 className="text-[1.75rem] font-medium tracking-tight text-charcoal lg:text-3xl">
        You May Also Like
      </h2>

      <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4 lg:gap-x-8">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`/brands/${brand.id}`}
            className="group block"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2px] bg-stone-50">
              <Image
                src={brand.image}
                alt={brand.name}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.045]"
              />
            </div>
            <div className="mt-4">
              <h3 className="text-[14px] font-medium tracking-wide text-charcoal">
                {brand.name}
              </h3>
              <p className="mt-1 text-[12.5px] font-light text-muted">
                {brand.category} — {brand.city}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
