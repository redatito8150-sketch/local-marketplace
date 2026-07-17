export interface JournalArticle {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  category: string;
  body: string[];
}

export const ARTICLES: JournalArticle[] = [
  {
    slug: "inside-marga-studio",
    title: "Inside MARGA Studio's Cairo Atelier",
    excerpt:
      "A look at how one linen brand builds every piece by hand, from pattern to finished garment.",
    image:
      "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=1200&q=80",
    category: "Makers",
    body: [
      "Tucked behind a quiet street in downtown Cairo, MARGA Studio's atelier runs on a rhythm that hasn't changed much in decades — pattern, cut, stitch, press.",
      "Every piece begins as a sketch inspired by the city's architecture and light, then moves through the hands of a small team of pattern makers and tailors before it ever reaches a rack.",
      "It's slower than mass production, and that's the point. Small batches mean the studio can stay close to the details that matter: seam finishes, fabric weight, the way a shirt moves when you walk.",
    ],
  },
  {
    slug: "guide-to-egyptian-cotton",
    title: "A Short Guide to Egyptian Cotton",
    excerpt:
      "Why the fabric that built an export economy is still the gold standard for softness and durability.",
    image:
      "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&q=80",
    category: "Craft",
    body: [
      "Egyptian cotton has a longer fiber staple than most cotton grown elsewhere, which is what gives fabric made from it that particular softness and strength.",
      "The Nile Delta's soil and climate have supported cotton cultivation for well over a century, and the crop remains one of the country's most recognized exports.",
      "For the brands on Local, sourcing cotton close to home isn't just about quality — it's about keeping the entire supply chain, from fiber to finished piece, inside Egypt.",
    ],
  },
  {
    slug: "summer-2026-edit",
    title: "The Summer 2026 Edit",
    excerpt:
      "Lightweight layers, breathable linen, and warm neutrals — our picks for the season ahead.",
    image:
      "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=1200&q=80",
    category: "Edits",
    body: [
      "This season's edit leans into fabrics that breathe — linen blends, brushed cotton, and airy knits built for long, warm days.",
      "The palette stays close to the earth: sand, bone, and soft taupe, with the occasional deep navy for contrast.",
      "Every piece in the edit comes from a brand producing in small batches, so the pieces you find here won't be sitting on every rack this summer.",
    ],
  },
  {
    slug: "meet-the-makers-sahara-form",
    title: "Meet the Makers: Sahara Form",
    excerpt:
      "How a small ceramics studio in Cairo is reviving traditional glazing techniques.",
    image:
      "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80",
    category: "Makers",
    body: [
      "Sahara Form started as a two-person workshop experimenting with glazes pulled from techniques nearly lost to time.",
      "Today, the studio produces small collections of tableware and home objects, each piece finished by hand and never quite identical to the last.",
      "Their process is deliberately unhurried — a quiet rebuttal to the pace of mass-produced home goods.",
    ],
  },
];

export function getArticle(slug: string): JournalArticle | null {
  return ARTICLES.find((a) => a.slug === slug) ?? null;
}
