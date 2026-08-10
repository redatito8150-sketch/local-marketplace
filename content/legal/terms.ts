// Terms & Conditions content — see content/legal/privacy.ts for the
// authoring convention (plain strings, [BRACKET_TOKEN] placeholders,
// stable section ids used for both the accordion and deep-linking).

import type { LegalSection } from "@/types";

export const TERMS_INTRO =
  "These Terms & Conditions govern your access to and use of our website, mobile application, accounts, marketplace services, purchases, and related features. By using the platform, you agree to these terms.";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "about-the-platform",
    title: "About the Platform",
    body: [
      {
        type: "paragraph",
        text: "Zakhnook is a multi-brand marketplace. Independent brands and sellers own and supply the products listed on Zakhnook — we don't manufacture or hold inventory of most products ourselves. Zakhnook facilitates product discovery, ordering, payment coordination, delivery coordination, customer support, and related services that connect you with those brands.",
      },
      {
        type: "paragraph",
        text: "Because brands operate independently on our platform, some obligations described in these terms (like product descriptions, stock availability, and fulfillment) are the brand's responsibility, while others (like account security, platform-wide policies, and payment coordination) are ours. We've tried to be clear about which is which throughout this document.",
      },
    ],
  },
  {
    id: "eligibility-and-account-registration",
    title: "Eligibility and Account Registration",
    body: [
      {
        type: "list",
        items: [
          "You must be at least [MINIMUM_AGE] years old to create an account.",
          "You must provide accurate, current information when registering and keep it up to date.",
          "You're responsible for maintaining the security of your account and password, and for all activity under your account.",
          "You can sign in with email/password or with a supported social login (currently Google).",
          "Each person may hold one account, unless we agree otherwise.",
          "You must notify us promptly if you suspect unauthorized access to your account.",
          "We may suspend or terminate accounts involved in abuse, fraud, or violations of these terms — see \"Suspension and Termination\" below.",
        ],
      },
    ],
  },
  {
    id: "account-linking-and-authentication",
    title: "Account Linking and Authentication",
    body: [
      {
        type: "paragraph",
        text: "If you sign in with both email/password and a supported social login (like Google) using the same verified email address, our authentication provider (Supabase) links these as one account rather than creating a duplicate — you'll have one account, one order history, and one profile regardless of which method you use to sign in.",
      },
      {
        type: "paragraph",
        text: "You're responsible for maintaining access to whichever email address or provider account (e.g., your Google account) is linked to your Zakhnook account, since either can be used to sign in. We may require additional verification before allowing certain actions, for security reasons.",
      },
    ],
  },
  {
    id: "brands-sellers-and-listings",
    title: "Brands, Sellers, and Product Listings",
    body: [
      {
        type: "list",
        items: [
          "Products on Zakhnook may be offered by independent brands and sellers.",
          "Sellers are responsible for the accuracy of their product descriptions, for offering only lawful products, for stock availability, and for fulfilling accepted orders.",
          "Product colors and appearance may vary depending on your screen.",
          "We may correct listing errors or remove listings, including after an order is placed, where necessary.",
          "A product being shown as available does not guarantee availability — availability is confirmed only once an order for it is accepted, consistent with \"Orders and Order Acceptance\" below.",
        ],
      },
    ],
  },
  {
    id: "orders-and-order-acceptance",
    title: "Orders and Order Acceptance",
    body: [
      {
        type: "paragraph",
        text: "A single checkout on Zakhnook may include products from multiple brands. From your side, this is one purchase — a single master order. Behind the scenes, we may divide it into separate brand or vendor orders, since each brand fulfills its own portion independently.",
      },
      {
        type: "list",
        items: [
          "Each brand may accept, prepare, or reject its portion of an order separately.",
          "Submitting an order is not the same as that order being accepted — acceptance happens according to our order workflow, and we'll keep you updated on its status.",
          "If an item is unavailable or a brand rejects part of an order, that portion may be cancelled or refunded, consistent with the payment method used and our \"Payments\" and \"Returns, Exchanges, Cancellations, and Refunds\" sections.",
        ],
      },
    ],
  },
  {
    id: "pricing-taxes-fees-and-promotions",
    title: "Pricing, Taxes, Fees, and Promotions",
    body: [
      {
        type: "list",
        items: [
          "Displayed prices are shown at the time you view a product and are subject to change before you complete checkout.",
          "Applicable taxes and delivery fees, where they apply, are shown before you confirm your order.",
          "Promotional codes are subject to their own stated terms, validity period, and any usage restrictions.",
          "If a price is displayed in obvious error, we may cancel or correct the affected order rather than honor the erroneous price.",
          "Prices are shown in the currency indicated at checkout.",
          "The final amount you owe is shown for your review before you confirm your order.",
        ],
      },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    body: [
      {
        type: "list",
        items: [
          "Supported payment methods are shown at checkout and may include cash on delivery, where available.",
          "By placing an order, you authorize us (or our payment processor) to process payment using your selected method.",
          "Where electronic payment methods are supported, a third-party payment processor handles your payment credentials under its own terms and privacy notice — Zakhnook does not store complete card numbers.",
          "We may use fraud-prevention checks before confirming payment.",
          "If a payment fails or is reversed, we may cancel the associated order.",
          "Refunds, where due, are issued to the original payment method where applicable.",
        ],
      },
    ],
  },
  {
    id: "shipping-and-delivery",
    title: "Shipping and Delivery",
    body: [
      {
        type: "list",
        items: [
          "An order containing products from multiple brands may arrive in multiple packages, since each brand's portion may ship separately with its own tracking information.",
          "Delivery estimates shown at checkout or in order tracking are estimates, not guarantees.",
          "You're responsible for providing an accurate delivery address and a reachable phone number.",
          "Delivery partners may contact you directly to coordinate delivery.",
          "Delays can happen for reasons outside our reasonable control — including brand processing times, delivery-provider capacity, weather, or public events.",
        ],
      },
      {
        type: "paragraph",
        text: "Rules for failed deliveries and re-delivery attempts: [CANCELLATION_RULES].",
      },
    ],
  },
  {
    id: "returns-exchanges-cancellations-refunds",
    title: "Returns, Exchanges, Cancellations, and Refunds",
    body: [
      {
        type: "list",
        items: [
          "Return eligibility depends on the product type, its condition, the selling brand's policy, and applicable law.",
          `Return window: [RETURN_WINDOW].`,
          "We don't maintain a list of non-returnable categories here until that's been confirmed with each brand's policy — check the product page or contact support for a specific item.",
          "Returned items may need to be inspected before a refund is approved.",
          "Refund timing can depend on your payment provider once we've approved a refund.",
          "Whether delivery/shipping fees are refundable depends on the confirmed return policy for that order.",
          "Damaged, incorrect, or missing items should be reported to customer support as soon as possible after delivery.",
          "Cancellation terms differ depending on whether your order has already been accepted by the brand — see \"Orders and Order Acceptance\" above.",
        ],
      },
      {
        type: "paragraph",
        text: "A dedicated Returns & Refunds page with full details isn't published yet — until it is, contact customer support for guidance on a specific order.",
      },
    ],
  },
  {
    id: "reviews-and-user-generated-content",
    title: "Reviews and User-Generated Content",
    body: [
      {
        type: "list",
        items: [
          "You may submit reviews, ratings, photos, questions, and comments on products you've purchased.",
          "Content you submit must be truthful and lawful.",
          "Reviews from confirmed purchases may be labeled \"Verified Purchase\".",
          "We prohibit spam, harassment, illegal content, impersonation, infringing material, and attempts to manipulate ratings.",
          "We may moderate, hide, or remove content that violates these terms.",
          "Brands may reply publicly to reviews of their products.",
          "Where available, you may report content or mark it as helpful.",
          "You retain ownership of the original content you submit, and grant us a license — limited to what's necessary to display, distribute, and promote it on the platform — to use it for that purpose.",
        ],
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use and Prohibited Conduct",
    body: [
      { type: "paragraph", text: "You agree not to:" },
      {
        type: "list",
        items: [
          "Commit or attempt fraud",
          "Access accounts or systems without authorization",
          "Introduce malicious code",
          "Scrape the platform where prohibited",
          "Abuse promotional offers or accounts",
          "Abuse payment methods or processes",
          "Use a false identity",
          "Interfere with the platform's normal operation",
          "Infringe intellectual property rights",
          "Buy or sell illegal goods through the platform",
          "Manipulate reviews or ratings",
        ],
      },
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    body: [
      {
        type: "paragraph",
        text: "The Zakhnook platform — including its code, design, branding, text, graphics, and databases — is owned by us or our licensors and is protected by intellectual property laws. Brand names, logos, and product trademarks shown on the platform may belong to their respective owners and are used to identify their products.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    body: [
      {
        type: "paragraph",
        text: "How we collect, use, and share your personal information is described in our Privacy Policy (/privacy), which forms part of these terms.",
      },
    ],
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    body: [
      {
        type: "paragraph",
        text: "The platform relies on and links to third-party services — including brands and sellers, delivery providers, payment processors, authentication providers, and external websites. We're not responsible for the content, policies, or practices of those third parties.",
      },
    ],
  },
  {
    id: "suspension-and-termination",
    title: "Suspension and Termination",
    body: [
      {
        type: "paragraph",
        text: "We may restrict, suspend, or terminate your access to the platform for reasons including breach of these terms, suspected fraud, security concerns, legal requirements, misuse of the platform, or non-payment.",
      },
      {
        type: "paragraph",
        text: "If your account is terminated, pending orders, refunds, and any legal or record-keeping obligations (such as retaining anonymized order records) will still be handled as described in these terms and our Privacy Policy.",
      },
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: [
      {
        type: "list",
        items: [
          "The platform may be unavailable or interrupted from time to time, including for maintenance.",
          "Listings may contain errors despite our and our brands' efforts.",
          "Products are subject to availability.",
        ],
      },
      {
        type: "paragraph",
        text: "Nothing in this section is intended to disclaim any consumer right that applicable law does not allow us to disclaim.",
      },
    ],
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    body: [
      {
        type: "paragraph",
        text: "To the maximum extent permitted by applicable law, Zakhnook is not liable for indirect, incidental, or consequential damages arising from your use of the platform. Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited, and mandatory consumer protections under applicable law remain unaffected.",
      },
    ],
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: [
      {
        type: "paragraph",
        text: "You agree to indemnify us against reasonably foreseeable losses directly arising from your breach of these terms or your misuse of the platform, to the extent permitted by applicable law. [INDEMNITY_CLAUSE_PENDING_LEGAL_REVIEW] — the scope of this clause should be reviewed by legal counsel before publication to confirm it's reasonable and not one-sided.",
      },
    ],
  },
  {
    id: "governing-law-and-disputes",
    title: "Governing Law and Disputes",
    body: [
      {
        type: "paragraph",
        text: "These terms are governed by the laws of [GOVERNING_LAW]. Any dispute arising from these terms or your use of the platform will be subject to [COURT_OR_DISPUTE_FORUM].",
      },
    ],
  },
  {
    id: "changes-to-these-terms",
    title: "Changes to These Terms",
    body: [
      {
        type: "paragraph",
        text: "We may update these Terms & Conditions from time to time. When we make a material change, we'll provide additional notice where appropriate. Continued use of the platform after an update takes effect may constitute acceptance of the revised terms, where legally valid.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      {
        type: "list",
        items: [
          "[LEGAL_ENTITY_NAME]",
          "Support: [SUPPORT_EMAIL]",
          "[REGISTERED_ADDRESS]",
          "[COUNTRY_OF_OPERATION]",
        ],
      },
    ],
  },
];
