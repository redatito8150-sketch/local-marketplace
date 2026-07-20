"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function FollowBrandButton({
  brandSlug,
  initialFollowing,
  signedIn,
}: {
  brandSlug: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <Link
        href="/account"
        className="rounded-full bg-white px-7 py-3 text-[13px] font-medium tracking-wide text-charcoal transition-all hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        Sign in to Follow
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandSlug}/follow`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setFollowing(data.following);
      // Refreshes the stats band's server-computed Followers count too.
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded-full bg-white px-7 py-3 text-[13px] font-medium tracking-wide text-charcoal transition-all hover:bg-white/90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {following ? "Following" : "Follow Brand"}
    </button>
  );
}
