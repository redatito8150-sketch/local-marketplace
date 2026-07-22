import assert from "node:assert/strict";
import test from "node:test";
import { validatePageSectionConfig } from "../lib/pageStudio/registry.ts";

test("accepts a valid typed product carousel", () => {
  assert.equal(
    validatePageSectionConfig("product_carousel", {
      title: "New Arrivals",
      source: "new",
      itemCount: 10,
      displayStyle: "carousel",
    }),
    null
  );
});

test("rejects executable or raw component configuration", () => {
  assert.match(
    validatePageSectionConfig("text_block", {
      title: "Unsafe",
      body: "Text",
      component: "eval(userInput)",
    }) ?? "",
    /Unsupported configuration field/
  );
});

test("rejects javascript links", () => {
  assert.equal(
    validatePageSectionConfig("hero", {
      headingLines: ["Local brands"],
      subheading: "Made here",
      ctaLabel: "Shop",
      ctaHref: "javascript:alert(1)",
    }),
    "Hero button link is invalid"
  );
});

test("caps storefront product counts", () => {
  assert.equal(
    validatePageSectionConfig("all_products_preview", {
      title: "Explore All Products",
      itemCount: 500,
      sorting: "newest",
    }),
    "Item count must be between 1 and 20"
  );
});

test("requires image alt text for editorial media", () => {
  assert.equal(
    validatePageSectionConfig("editorial_image", {
      image: "https://images.example.com/editorial.jpg",
      imageAlt: "",
    }),
    "Image and alt text are required"
  );
});

test("accepts the legacy keyed category-card shape during migration", () => {
  assert.equal(
    validatePageSectionConfig("category_cards", {
      women: { label: "Women", href: "/shop/women", image: "/images/women.png" },
      men: { label: "Men", href: "/shop/men", image: "/images/men.png" },
    }),
    null
  );
});

test("validates every benefit instead of accepting an empty placeholder", () => {
  assert.equal(
    validatePageSectionConfig("benefits_strip", { items: [{ title: "Secure", detail: "Trusted checkout" }] }),
    null
  );
  assert.match(
    validatePageSectionConfig("benefits_strip", { items: [{ title: "Secure" }] }) ?? "",
    /Every benefit/
  );
});
