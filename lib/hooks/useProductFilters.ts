"use client";

import { useMemo, useState } from "react";
import { Product, SortOption } from "@/types";

// Extracted from CategoryShoppingArea (Round 4) so /shop/[category] and the
// brand page's own shopping area share one filtering/sorting
// implementation instead of two copies drifting apart. Behavior here must
// stay byte-identical to what CategoryShoppingArea had before this
// extraction — it's a pure move, not a rewrite.
function matchesPriceRange(price: number, rangeId: string): boolean {
  switch (rangeId) {
    case "under-500":
      return price < 500;
    case "500-1000":
      return price >= 500 && price <= 1000;
    case "1000-2000":
      return price > 1000 && price <= 2000;
    case "2000-5000":
      return price > 2000 && price <= 5000;
    case "above-5000":
      return price > 5000;
    default:
      return true;
  }
}

function matchesRating(rating: number, ratingId: string): boolean {
  switch (ratingId) {
    case "4-plus":
      return rating >= 4;
    case "3-plus":
      return rating >= 3;
    default:
      return true;
  }
}

function matchesAvailability(inStock: boolean, availabilityId: string): boolean {
  switch (availabilityId) {
    case "in-stock":
      return inStock;
    case "out-of-stock":
      return !inStock;
    default:
      return true;
  }
}

export function useProductFilters(products: Product[], initialSelected?: Record<string, string[]>) {
  const [sort, setSort] = useState<SortOption>("newest");
  const [selected, setSelected] = useState<Record<string, string[]>>(() => initialSelected ?? {});

  const toggleFilter = (groupId: string, optionId: string) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [groupId]: next };
    });
  };

  const clearFilters = () => setSelected({});

  const filteredProducts = useMemo(() => {
    // Brand/size/color/category/type/collection/material/fit options are
    // generated from real product data with id === label (lib/filters.ts),
    // so matching is a direct value comparison — no reverse lookup into
    // filterGroups needed.
    const selectedBrandIds = selected.brand ?? [];
    const selectedPriceIds = selected.price ?? [];
    const selectedSizeIds = selected.size ?? [];
    const selectedColorIds = selected.color ?? [];
    const selectedCategoryIds = selected.productCategory ?? [];
    const selectedTypeIds = selected.productType ?? [];
    const selectedCollectionIds = selected.collection ?? [];
    const selectedMaterialIds = selected.material ?? [];
    const selectedFitIds = selected.fit ?? [];
    const selectedAvailabilityIds = selected.availability ?? [];
    const selectedRatingIds = selected.rating ?? [];
    const selectedFeaturedIds = selected.featured ?? [];

    return products.filter((product) => {
      if (selectedBrandIds.length > 0 && !selectedBrandIds.includes(product.brand)) {
        return false;
      }

      // Price — OR across selected ranges (a product only needs to fall
      // into one of the checked ranges)
      if (
        selectedPriceIds.length > 0 &&
        !selectedPriceIds.some((rangeId) => matchesPriceRange(product.price, rangeId))
      ) {
        return false;
      }

      // Size — product must offer at least one of the selected sizes
      if (
        selectedSizeIds.length > 0 &&
        !product.sizes.some((size) => selectedSizeIds.includes(size))
      ) {
        return false;
      }

      // Color — product must offer at least one of the selected colors
      if (
        selectedColorIds.length > 0 &&
        !product.colors.some((color) => selectedColorIds.includes(color.name))
      ) {
        return false;
      }

      if (
        selectedCategoryIds.length > 0 &&
        (!product.productCategory || !selectedCategoryIds.includes(product.productCategory))
      ) {
        return false;
      }

      if (
        selectedTypeIds.length > 0 &&
        (!product.productType || !selectedTypeIds.includes(product.productType))
      ) {
        return false;
      }

      if (
        selectedCollectionIds.length > 0 &&
        (!product.collection || !selectedCollectionIds.includes(product.collection))
      ) {
        return false;
      }

      if (
        selectedMaterialIds.length > 0 &&
        (!product.material || !selectedMaterialIds.includes(product.material))
      ) {
        return false;
      }

      if (selectedFitIds.length > 0 && (!product.fit || !selectedFitIds.includes(product.fit))) {
        return false;
      }

      // Availability — OR across selected states (usually only one is picked)
      if (
        selectedAvailabilityIds.length > 0 &&
        !selectedAvailabilityIds.some((id) => matchesAvailability(product.inStock, id))
      ) {
        return false;
      }

      // Rating — OR across selected thresholds
      if (
        selectedRatingIds.length > 0 &&
        !selectedRatingIds.some((id) => matchesRating(product.rating, id))
      ) {
        return false;
      }

      if (selectedFeaturedIds.length > 0 && !product.featured) {
        return false;
      }

      return true;
    });
  }, [products, selected]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sort) {
      case "price-asc":
        return list.sort((a, b) => a.price - b.price);
      case "price-desc":
        return list.sort((a, b) => b.price - a.price);
      case "top-rated":
        return list.sort((a, b) => b.rating - a.rating);
      default:
        return list;
    }
  }, [filteredProducts, sort]);

  return { selected, sort, setSort, toggleFilter, clearFilters, filteredProducts, sortedProducts };
}
