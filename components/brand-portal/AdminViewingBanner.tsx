import Link from "next/link";

export default function AdminViewingBanner({ brandName }: { brandName: string }) {
  return (
    <div className="mb-6 flex items-center justify-between rounded-md bg-beige-100 px-4 py-2.5 text-[12.5px] text-ink">
      <span>
        Viewing <span className="font-semibold">{brandName}</span>&apos;s portal as admin.
      </span>
      <Link href="/brand-portal" className="font-semibold hover:underline">
        Switch brand
      </Link>
    </div>
  );
}
