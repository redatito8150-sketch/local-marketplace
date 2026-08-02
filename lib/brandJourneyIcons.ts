import type { JourneyIconKey } from "@/types";

// The icon choices offered in the "Our journey" milestone picker
// (components/brand/BrandJourneyTimeline.tsx). Kept here as plain data (no
// lucide-react import) so the inline-edit API route can validate an
// incoming icon key against this list without pulling React into a
// server-only request handler — the icon-to-component map itself lives
// next to the picker UI in BrandJourneyTimeline.tsx.
export const JOURNEY_ICON_KEYS = [
  "sparkles",
  "store",
  "heart",
  "award",
  "rocket",
  "package",
  "star",
  "trophy",
  "palette",
  "users",
  "map-pin",
  "shopping-bag",
] satisfies JourneyIconKey[];
