// Privacy Policy content — plain, readable strings with [BRACKET_TOKEN]
// placeholders written inline wherever a value hasn't been legally
// finalized yet (see config/legal.ts for the full registry and
// docs/legal-placeholders-todo.md for what still needs sign-off).
// components/legal/LegalRichText.tsx auto-detects and flags any bracket
// token when rendering — nothing here needs extra markup for that.
//
// Section ids are stable and used both for the table of contents and for
// deep-linking (#section-id) — don't rename an id without checking
// tests/legalPages.test.ts and any external links that may depend on it.

import type { LegalSection } from "@/types";

export const PRIVACY_INTRO =
  "Your privacy matters to us. This Privacy Policy explains what information we collect, why we use it, how it may be shared, and the choices and rights available to you when you use our website, mobile application, and related services.";

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "about-this-policy",
    title: "About This Privacy Policy",
    body: [
      {
        type: "paragraph",
        text: "This Privacy Policy is operated by [LEGAL_ENTITY_NAME], trading as Mahaly (\"Mahaly\", \"we\", \"us\", or \"our\"). It applies to our website, mobile application, customer accounts, purchases, customer-support interactions, and any other service that links to this policy.",
      },
      {
        type: "paragraph",
        text: "Mahaly is a marketplace: independent brands and sellers list and fulfill their own products through our platform. Where a brand, seller, delivery partner, or other third party processes your information under its own privacy notice, that notice — not this one — governs that specific processing. We'll identify those cases where practical throughout this policy.",
      },
    ],
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    body: [
      { type: "subheading", text: "A. Information you provide directly" },
      {
        type: "list",
        items: [
          "Name",
          "Email address",
          "Phone number",
          "Password credentials — handled entirely by our authentication provider (Supabase); we never see or store your raw password",
          "Account profile details",
          "Profile image (manually uploaded, or a fallback photo from a connected sign-in provider — see \"Google User Data\" below)",
          "Delivery and billing addresses",
          "Order details",
          "Saved preferences",
          "Wishlist and cart activity",
          "Reviews, ratings, reports, and other content you submit",
          "Customer-support communications",
          "Brand or seller application information, if you apply to sell on Mahaly",
        ],
      },
      { type: "subheading", text: "B. Information received through social login" },
      {
        type: "paragraph",
        text: "If you sign in with Google, we receive your Google account identifier, verified email address, name, profile image, and any other authentication-provider metadata Google permits and you authorize. We do not receive your Google password.",
      },
      { type: "subheading", text: "C. Transaction and payment information" },
      {
        type: "list",
        items: [
          "Payment status",
          "Payment method type",
          "Transaction reference",
          "Refund status",
          "Cash-on-delivery details, where that payment method is used",
        ],
      },
      {
        type: "paragraph",
        text: "Mahaly does not store complete payment card numbers. Where card or other electronic payment methods are offered, the payment provider processes your payment credentials under its own privacy notice, and shares with us only what's needed to confirm and reconcile your order.",
      },
      { type: "subheading", text: "D. Technical and usage information" },
      {
        type: "list",
        items: [
          "IP address",
          "Browser and device information",
          "Operating system",
          "Application version",
          "Language",
          "Session and security information",
          "Pages viewed, clicks, and interactions",
          "Referral source",
          "Timestamps",
          "Crash and diagnostic information",
          "Fraud- and abuse-prevention signals",
        ],
      },
      { type: "subheading", text: "E. Cookies and similar technologies" },
      {
        type: "paragraph",
        text: "We use cookies and similar technologies as described in the \"Cookies and Similar Technologies\" section below.",
      },
    ],
  },
  {
    id: "how-we-use-information",
    title: "How We Use Information",
    body: [
      {
        type: "paragraph",
        text: "Where required or permitted by applicable law, we use the information above to:",
      },
      {
        type: "list",
        items: [
          "Create and manage your account",
          "Authenticate you and keep your account secure",
          "Process and fulfill orders",
          "Coordinate with brands, sellers, delivery providers, and payment providers involved in your order",
          "Deliver products",
          "Manage returns and refunds",
          "Maintain your cart, wishlist, saved addresses, and preferences",
          "Provide customer support",
          "Send transactional messages (order confirmations, shipping updates, security alerts)",
          "Send marketing communications, only where permitted and, where required, only with your consent",
          "Display reviews and other user-generated content",
          "Prevent fraud and protect account security",
          "Operate platform analytics and improve performance",
          "Comply with legal obligations and handle disputes",
          "Enforce our platform rules and Terms & Conditions",
          "Protect customers, brands, delivery partners, and the platform generally",
        ],
      },
    ],
  },
  {
    id: "how-we-share-information",
    title: "How We Share Information",
    body: [
      {
        type: "paragraph",
        text: "Because Mahaly is a marketplace, fulfilling your order and operating the platform requires sharing certain information with the parties involved in that order and the services that run the platform. We share only what's reasonably necessary for each recipient's role:",
      },
      {
        type: "list",
        items: [
          "Brands and sellers involved in your order (to prepare and fulfill it)",
          "Delivery and logistics providers",
          "Payment processors",
          "Authentication providers, such as Google",
          "Email and notification service providers",
          "Hosting, database, storage, analytics, security, and customer-support providers",
          "Professional advisers (legal, accounting, and similar)",
          "Regulators, courts, or authorities, where legally required",
          "A buyer or successor, in the event of a merger, acquisition, restructuring, or asset transfer",
        ],
      },
      {
        type: "paragraph",
        text: "[DATA_SALE_POLICY_PENDING_CONFIRMATION] — the business/legal owner must confirm the exact commitment regarding sale of personal information before this section is published, rather than this policy asserting one without that confirmation.",
      },
    ],
  },
  {
    id: "google-user-data",
    title: "Google User Data",
    body: [
      {
        type: "paragraph",
        text: "Mahaly supports signing in with Google. This section explains specifically what that involves, since Google's own policies require us to.",
      },
      {
        type: "list",
        items: [
          "We access your Google account identifier, verified email address, name, and profile image — the minimum Google provides for the \"openid\", \"email\", and \"profile\" sign-in scopes. We do not request access to Gmail, Drive, Calendar, or any other Google data.",
          "This data is used to authenticate you and to initialize your account (name and, where applicable, a fallback profile photo) the first time you sign in with Google.",
          "Your Google profile photo is used only as a fallback: if you've manually uploaded a photo in Mahaly, that photo is always shown instead, and is never replaced by your Google photo — including on later Google sign-ins.",
          "We never receive your Google password.",
          "Google-derived information is not used for advertising unrelated to Mahaly, and won't be, unless we disclose that clearly and obtain any consent required beforehand.",
          "A self-service Google identity disconnect is not currently available. You can stop using Google to sign in, or request deletion of your Mahaly account information at any time — see \"Account Deletion\" below.",
        ],
      },
    ],
  },
  {
    id: "data-retention",
    title: "Data Retention",
    body: [
      {
        type: "paragraph",
        text: "We keep information for as long as your account is active, as needed to provide our services, to complete transactions, and to meet our tax, accounting, fraud-prevention, dispute, and other legal obligations. When you request deletion, we retain only what we're required or permitted to keep, for as long as required.",
      },
      {
        type: "paragraph",
        text: "Exact retention periods and the criteria used to set them: [DATA_RETENTION_PERIOD_OR_CRITERIA].",
      },
    ],
  },
  {
    id: "data-security",
    title: "Data Security",
    body: [
      {
        type: "paragraph",
        text: "We use reasonable administrative, technical, and organizational safeguards designed to protect your information — including access controls, encryption in transit, and restricted service-role access to our database. No method of transmission or storage is completely secure, and we can't guarantee absolute security.",
      },
    ],
  },
  {
    id: "international-data-transfers",
    title: "International Data Transfers",
    body: [
      {
        type: "paragraph",
        text: "Some of our service providers may process information in countries other than the one you're located in. Where applicable law requires it, we use appropriate safeguards for these transfers. The specific transfer mechanism applicable to your location will be confirmed here once determined: [APPLICABLE_PRIVACY_AUTHORITY].",
      },
    ],
  },
  {
    id: "your-rights-and-choices",
    title: "User Rights and Choices",
    body: [
      {
        type: "paragraph",
        text: "Depending on your location and applicable law, you may have rights to:",
      },
      {
        type: "list",
        items: [
          "Access the personal information we hold about you",
          "Correct inaccurate information",
          "Delete your information",
          "Object to certain processing",
          "Restrict certain processing",
          "Receive a portable copy of your information",
          "Withdraw consent, where processing relies on it",
          "Opt out of marketing communications",
          "Manage cookie preferences",
          "Delete your account",
          "Lodge a complaint with a data protection authority",
        ],
      },
      {
        type: "paragraph",
        text: "To exercise a privacy right, contact us at [PRIVACY_EMAIL] or use the account and support tools available in the platform.",
      },
    ],
  },
  {
    id: "account-deletion",
    title: "Account Deletion",
    body: [
      {
        type: "paragraph",
        text: "You can request account deletion from Account → Security → Delete account. This permanently removes your sign-in credentials and personal profile — including your saved addresses, wishlist, and follows.",
      },
      {
        type: "paragraph",
        text: "Some information may need to be retained even after deletion — for example, your past orders are kept, but anonymized, so brands and the platform can maintain accurate transaction, tax, and accounting records.",
      },
      {
        type: "paragraph",
        text: "Uninstalling the Mahaly app from your device does not delete your account. You must use the account-deletion option above, or contact us at [PRIVACY_EMAIL], to actually delete your account.",
      },
    ],
  },
  {
    id: "childrens-privacy",
    title: "Children's Privacy",
    body: [
      {
        type: "paragraph",
        text: "Mahaly is not intended for children under [MINIMUM_AGE], and we don't knowingly collect personal information from children under that age. If you believe a child has provided us with personal information, contact us at [PRIVACY_EMAIL] so we can address it.",
      },
    ],
  },
  {
    id: "cookies",
    title: "Cookies and Similar Technologies",
    body: [
      { type: "paragraph", text: "We use the following categories of cookies and similar technologies:" },
      {
        type: "list",
        items: [
          "Essential cookies — required for the site to function (e.g., staying signed in, remembering your cart)",
          "Authentication/session cookies — keep you securely signed in between requests",
          "Preference cookies — remember choices like display preferences",
          "Analytics cookies — help us understand how the platform is used, so we can improve it",
          "Security and fraud-prevention technologies — help detect and prevent abuse",
        ],
      },
      {
        type: "paragraph",
        text: "We don't yet have a separate Cookie Policy page. Once one is published, it will be linked from here and from the site footer.",
      },
    ],
  },
  {
    id: "third-party-links",
    title: "Third-Party Links and Services",
    body: [
      {
        type: "paragraph",
        text: "Our platform may link to, or interact with, external websites, payment services, brand storefronts, and other third-party services. Those third parties operate under their own privacy policies, which we encourage you to review — this Privacy Policy doesn't cover them.",
      },
    ],
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to This Privacy Policy",
    body: [
      {
        type: "paragraph",
        text: "We may update this Privacy Policy from time to time. When we do, we'll revise the \"Last updated\" date at the top of this page, and where a change is material, we'll provide additional notice (for example, by email or an in-app notification) before it takes effect.",
      },
    ],
  },
  {
    id: "contact-us",
    title: "Contact Us",
    body: [
      {
        type: "paragraph",
        text: "If you have questions about this Privacy Policy or how we handle your information, contact us:",
      },
      {
        type: "list",
        items: [
          "[LEGAL_ENTITY_NAME]",
          "Privacy: [PRIVACY_EMAIL]",
          "Support: [SUPPORT_EMAIL]",
          "[REGISTERED_ADDRESS]",
          "[COUNTRY_OF_OPERATION]",
        ],
      },
    ],
  },
];
