import WishlistGrid from "@/components/wishlist/WishlistGrid";
import { AccountPageHeader } from "@/components/account/AccountUI";

export default function AccountWishlistPage() {
  return (
    <div className="space-y-7">
      <AccountPageHeader eyebrow="Saved for later" title="Wishlist" description="A personal collection of pieces you love and may want to revisit." />
      <WishlistGrid />
    </div>
  );
}
