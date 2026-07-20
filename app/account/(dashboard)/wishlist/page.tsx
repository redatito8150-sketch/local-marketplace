import WishlistGrid from "@/components/wishlist/WishlistGrid";

export default function AccountWishlistPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tightest text-ink">Wishlist</h1>
      <p className="mt-1 text-[13.5px] text-ink-soft/60">
        Everything you&apos;ve saved for later.
      </p>
      <WishlistGrid />
    </div>
  );
}
