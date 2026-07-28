"use client";

import CollectionSelect from "@/components/admin/CollectionSelect";

export default function CollectionManagementPanel({
  brandId,
  brandSlug,
}: {
  brandId: string;
  brandSlug: string;
}) {
  return (
    <CollectionSelect
      brandId={brandId}
      value=""
      onChange={() => undefined}
      apiBasePath="/api/brand-portal"
      brandSlug={brandSlug}
    />
  );
}
