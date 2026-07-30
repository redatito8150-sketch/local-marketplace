// Fixed Fashion care-instruction catalog for the Product Details "Care
// Instructions" multi-select (components/admin/CareInstructionsPicker.tsx).
// No free-text custom instructions in this system — selection is always
// from this list, stored as a plain string[] (products.care_instructions).
export interface CareInstructionGroup {
  group: string;
  options: string[];
}

export const CARE_INSTRUCTION_GROUPS: CareInstructionGroup[] = [
  {
    group: "Washing",
    options: [
      "Machine wash cold",
      "Machine wash warm",
      "Machine wash gentle cycle",
      "Hand wash",
      "Wash separately",
      "Wash with similar colors",
      "Wash inside out",
      "Do not wash",
    ],
  },
  {
    group: "Bleaching",
    options: ["Do not bleach", "Only non-chlorine bleach", "Chlorine bleach allowed"],
  },
  {
    group: "Drying",
    options: [
      "Tumble dry low",
      "Tumble dry medium",
      "Tumble dry high",
      "Do not tumble dry",
      "Line dry",
      "Hang dry",
      "Dry flat",
      "Drip dry",
      "Dry in shade",
    ],
  },
  {
    group: "Ironing",
    options: ["Iron low", "Iron medium", "Iron high", "Do not iron", "Iron inside out", "Steam iron allowed"],
  },
  {
    group: "Professional care",
    options: ["Dry clean", "Dry clean only", "Do not dry clean", "Professional wet clean", "Spot clean only"],
  },
  {
    group: "Special care",
    options: [
      "Do not wring",
      "Do not soak",
      "Remove promptly after washing",
      "Reshape while damp",
      "Close zippers before washing",
      "Fasten buttons before washing",
      "Remove detachable parts before washing",
      "Use mild detergent",
      "Do not use fabric softener",
    ],
  },
];

export const ALL_CARE_INSTRUCTIONS: string[] = CARE_INSTRUCTION_GROUPS.flatMap((g) => g.options);
