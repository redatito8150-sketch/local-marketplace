"use client";

import { useBrandEdit } from "./BrandEditContext";

// A section that's normally hidden entirely when its content is empty
// (e.g. "Our story" with no storyBody yet) still needs to appear for an
// owner/admin, so they have somewhere to click "+ Add" in the first place.
// Server Components can't know `canEdit` (client-only, see BrandEditContext)
// without breaking the page's ISR caching, so this tiny client wrapper is
// the one place that decides.
export default function InlineEditableSection({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) {
  const { canEdit } = useBrandEdit();
  if (!show && !canEdit) return null;
  return <>{children}</>;
}
