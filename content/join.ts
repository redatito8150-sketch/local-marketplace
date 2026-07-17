// Static copy for /join-as-a-brand — same role as content/categories.ts and
// content/navigation.ts: editorial content that ships with the code.

export interface JoinBenefit {
  icon: "users" | "tag" | "chart";
  title: string;
  description: string;
}

export const JOIN_HERO = {
  label: "JOIN LOCAL",
  headingLines: ["Join Egypt's", "next generation", "of brands."],
  subheading: "Build your brand. Reach more customers. Grow with Local.",
  ctaLabel: "Apply to LOCAL",
  images: {
    left: [
      {
        src: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=700&q=80",
        alt: "Local designer working in her studio",
      },
      {
        src: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=700&q=80",
        alt: "Designer sketching a new collection",
      },
    ],
    right: [
      {
        src: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=700&q=80",
        alt: "Local-made accessories and packaging",
      },
      {
        src: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&q=80",
        alt: "Folded garments ready for shipping",
      },
      {
        src: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=700&q=80",
        alt: "Model wearing a local brand's collection",
      },
    ],
  },
};

export const JOIN_BENEFITS: JoinBenefit[] = [
  {
    icon: "users",
    title: "Reach more customers",
    description:
      "Your brand becomes discoverable by thousands of shoppers who love and support local.",
  },
  {
    icon: "tag",
    title: "Keep your identity",
    description:
      "Your own brand page, your story, your products. We help you stay authentic and in control.",
  },
  {
    icon: "chart",
    title: "Manage everything",
    description:
      "From products to orders, analytics to payouts. Everything you need in one simple dashboard.",
  },
];

export const WHY_LOCAL_CHECKLIST: string[] = [
  "No monthly subscription",
  "Your own brand page",
  "Professional dashboard",
  "Built for Egyptian brands",
  "Premium editorial exposure",
  "Marketing opportunities",
  "Secure payments & on-time payouts",
];

export interface DashboardStat {
  label: string;
  value: string;
  delta: string;
}

export const DASHBOARD_STATS: DashboardStat[] = [
  { label: "Total Revenue", value: "EGP 128,540", delta: "+12.4% from last month" },
  { label: "Orders", value: "1,246", delta: "+8.7% from last month" },
  { label: "Visitors", value: "24,580", delta: "+15.3% from last month" },
];

export interface DashboardTopProduct {
  name: string;
  price: string;
  image: string;
}

export const DASHBOARD_TOP_PRODUCTS: DashboardTopProduct[] = [
  {
    name: "Linen Vest Top",
    price: "EGP 800",
    image: "https://images.unsplash.com/photo-1596783074918-c84cb06531ca?w=120&q=80",
  },
  {
    name: "Flowy Blouse",
    price: "EGP 1,100",
    image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=120&q=80",
  },
  {
    name: "Wide Leg Pants",
    price: "EGP 1,300",
    image: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=120&q=80",
  },
  {
    name: "Midi Everyday Bag",
    price: "EGP 1,800",
    image: "https://images.unsplash.com/photo-1611085583191-a3b181a88401?w=120&q=80",
  },
];

// Monthly revenue trend (arbitrary demo scale) driving the inline SVG chart.
export const REVENUE_CHART = {
  months: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  values: [180, 140, 225, 165, 205, 260, 230, 300, 340],
  highlight: { monthIndex: 2, label: "EGP 12,360", sublabel: "Jul 7, 2024" },
};

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initial: string;
}

export const SUCCESS_STORY: Testimonial = {
  quote:
    "Joining Local doubled our online visibility. The platform is beautiful, intuitive and the team truly supports local brands.",
  name: "Salma E.",
  role: "Founder of NOLA",
  initial: "S",
};

export interface FAQItem {
  question: string;
  answer: string;
}

export const JOIN_FAQ: FAQItem[] = [
  {
    question: "How much does it cost to sell on Local?",
    answer:
      "There's no monthly subscription. Listing your products and setting up your brand page is free — we only take a small commission on completed sales.",
  },
  {
    question: "What is the commission rate?",
    answer:
      "Commission varies by category and is confirmed with you during onboarding, before you list a single product — no surprises after you're live.",
  },
  {
    question: "How do payouts work?",
    answer:
      "Payouts are calculated automatically from your delivered orders and sent to your bank account on a regular schedule from your brand dashboard.",
  },
  {
    question: "How long does the approval process take?",
    answer:
      "Most applications are reviewed within 3–5 business days. We'll email you either way, and can ask follow-up questions if we need more detail.",
  },
  {
    question: "Do you handle shipping?",
    answer:
      "You ship orders yourself using your existing courier or delivery process — your dashboard gives you everything you need to fulfill each order.",
  },
];
