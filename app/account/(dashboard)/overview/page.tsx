import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  Heart,
  MapPin,
  Package,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/accountAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrdersForUser } from "@/lib/data/orders";
import { getAddressesForUser } from "@/lib/data/addresses";
import { getWishlistForUser } from "@/lib/data/wishlist";
import { getFollowedBrandsForUser } from "@/lib/data/follows";
import { SMS_VERIFICATION_ENABLED } from "@/lib/sms";
import { resolveAvatarUrl } from "@/lib/account/avatar";
import { formatPrice } from "@/lib/format";
import OrderCard from "@/components/account/OrderCard";
import FollowedBrandsRow from "@/components/account/FollowedBrandsRow";
import {
  AccountEmptyState,
  AccountHighlightCard,
  AccountPageHeader,
  AccountPanel,
  accountSecondaryButton,
} from "@/components/account/AccountUI";
export default async function AccountOverviewPage() {
  const user = await requireUser();
  if (!user) redirect("/account");

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, orders, addresses, wishlist, followedBrands] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, phone, phone_verified_at, avatar_url, provider_avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    getOrdersForUser(user.id),
    getAddressesForUser(user.id),
    getWishlistForUser(user.id),
    getFollowedBrandsForUser(user.id),
  ]);

  const fullName = profile?.full_name?.trim() || "there";
  const firstName = fullName.split(/\s+/)[0] || "there";
  const avatarUrl = resolveAvatarUrl(profile?.avatar_url, profile?.provider_avatar_url) ?? "";
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
  // Phone verification is only a real, checkable thing once an SMS provider
  // is actually configured — otherwise every account would show "phone not
  // verified" forever with no way to fix it, which isn't a useful signal.
  const completionChecks = [
    Boolean(profile?.full_name?.trim()),
    Boolean(profile?.phone?.trim()),
    Boolean(user.email_confirmed_at),
    Boolean(avatarUrl),
    Boolean(defaultAddress),
    ...(SMS_VERIFICATION_ENABLED ? [Boolean(profile?.phone_verified_at)] : []),
  ];
  const completeCount = completionChecks.filter(Boolean).length;
  const completion = Math.round((completeCount / completionChecks.length) * 100);
  const missing: string[] = [];
  if (!profile?.phone?.trim()) missing.push("phone number");
  if (!avatarUrl) missing.push("profile photo");
  if (!defaultAddress) missing.push("saved address");
  if (!user.email_confirmed_at) missing.push("email verification");
  if (SMS_VERIFICATION_ENABLED && profile?.phone?.trim() && !profile?.phone_verified_at) {
    missing.push("phone verification");
  }

  return (
    <div className="space-y-7">
      <AccountPageHeader
        eyebrow="Your Zakhnook"
        title={`Welcome back, ${firstName}`}
        description="Everything important about your orders, saved pieces, and personal details in one calm place."
        action={<Link href="/account/settings" className={accountSecondaryButton}>Edit profile</Link>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AccountHighlightCard icon={Package} label="Orders" value={orders.length} detail={orders.length ? "Your complete order history" : "Your orders will appear here"} href="/account/orders" />
        <AccountHighlightCard icon={Heart} label="Wishlist" value={wishlist.length} detail="Pieces saved for later" href="/account/wishlist" />
        <AccountHighlightCard icon={MapPin} label="Addresses" value={addresses.length} detail={defaultAddress ? `${defaultAddress.label} is your default` : "Add an address for faster checkout"} href="/account/addresses" tone={defaultAddress ? "success" : "warning"} />
        <AccountHighlightCard icon={CheckCircle2} label="Profile complete" value={`${completion}%`} detail={`${completeCount} of ${completionChecks.length} essentials ready`} href="/account/settings" tone={completion === 100 ? "success" : "accent"} />
      </section>

      {completion < 100 && (
        <AccountPanel className="bg-[var(--account-surface-muted)]">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="max-w-2xl">
              <p className="text-[15px] font-semibold text-[var(--account-text)]">A few details will make checkout easier</p>
              <p className="mt-1 text-[12.5px] leading-5 text-[var(--account-text-muted)]">
                Add your {missing.join(", ")} to finish setting up your personal account.
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--account-surface)]">
                <div className="h-full rounded-full bg-[var(--account-accent)]" style={{ width: `${completion}%` }} />
              </div>
            </div>
            <Link href="/account/settings" className={accountSecondaryButton}>Complete profile</Link>
          </div>
        </AccountPanel>
      )}

      <AccountPanel title="Recent orders" description="Your latest purchases and their current status" action={<Link href="/account/orders" className="text-[12px] font-semibold text-[var(--account-accent)] hover:underline">View all orders</Link>}>
        {orders.length ? (
          <div className="space-y-3 p-4 sm:p-5">
            {orders.slice(0, 3).map((order) => <OrderCard key={order.id} order={order} showItems={false} />)}
          </div>
        ) : (
          <AccountEmptyState title="No orders yet" description="When you place your first order, its status and total will appear here." action={<Link href="/shop/women" className={accountSecondaryButton}>Start shopping</Link>} />
        )}
      </AccountPanel>

      <AccountPanel title="Your wishlist" description="A few pieces you saved for later" action={<Link href="/account/wishlist" className="text-[12px] font-semibold text-[var(--account-accent)] hover:underline">View all saved items</Link>}>
        {wishlist.length ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            {wishlist.slice(0, 4).map((item) => (
              <Link key={item.productId} href={`/product/${item.productId}`} className="group overflow-hidden rounded-2xl border border-[var(--account-border)] bg-[var(--account-surface-muted)]">
                <div className="aspect-[4/3] overflow-hidden bg-[var(--account-surface)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="p-3">
                  <p className="truncate text-[12px] font-medium text-[var(--account-text-muted)]">{item.brand}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--account-text)]">{item.name}</p>
                  <p className="mt-1 text-[12.5px] font-semibold text-[var(--account-accent)]">{formatPrice(item.price, item.currency)}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <AccountEmptyState title="Your wishlist is ready" description="Tap the heart on any product to keep it here for later." action={<Link href="/new-arrivals" className={accountSecondaryButton}>Discover products</Link>} />
        )}
      </AccountPanel>

      <FollowedBrandsRow brands={followedBrands} />
    </div>
  );
}
