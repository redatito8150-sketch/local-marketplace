import type { Product } from "@/types";
import CollectionHero from "./CollectionHero";
import { COLLECTION_PAGE_CONFIGS } from "./collectionPageConfig";

export default function WomenCollectionHero({ products }: { products: Product[] }) {
  return <CollectionHero products={products} config={COLLECTION_PAGE_CONFIGS.women} />;
}
