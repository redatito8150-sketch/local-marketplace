"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface BrandEditState {
  canEdit: boolean;
  // Distinct from canEdit — canEdit is true for the brand's own owner too;
  // isAdmin is only true for platform staff, used to gate the handful of
  // fields (e.g. brand name) an owner should never be able to change
  // themselves.
  isAdmin: boolean;
  brandSlug: string;
}

const BrandEditContext = createContext<BrandEditState>({ canEdit: false, isAdmin: false, brandSlug: "" });

// One shared fetch of /viewer-status per brand-page visit (the same route
// BrandHeroActions already calls for Follow/"my brand" state — this just
// also reads its new `canEdit` field) so every InlineEditable* island on
// the page doesn't each fire its own request. Client-only, on mount — see
// app/api/brands/[slug]/viewer-status/route.ts for why this can't be
// resolved server-side without breaking the page's ISR caching.
export function BrandEditProvider({
  brandSlug,
  children,
}: {
  brandSlug: string;
  children: React.ReactNode;
}) {
  const [canEdit, setCanEdit] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brands/${brandSlug}/viewer-status`)
      .then((res) => res.json())
      .then((data: { canEdit?: boolean; isAdmin?: boolean }) => {
        if (!cancelled) {
          setCanEdit(Boolean(data.canEdit));
          setIsAdmin(Boolean(data.isAdmin));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanEdit(false);
          setIsAdmin(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandSlug]);

  return (
    <BrandEditContext.Provider value={{ canEdit, isAdmin, brandSlug }}>{children}</BrandEditContext.Provider>
  );
}

export function useBrandEdit() {
  return useContext(BrandEditContext);
}
