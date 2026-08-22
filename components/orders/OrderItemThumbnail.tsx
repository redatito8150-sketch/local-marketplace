import Image from "next/image";
import { PackageCheck } from "lucide-react";

export default function OrderItemThumbnail({ image, name, size = "md" }: { image?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const dimensions = size === "lg" ? "h-16 w-14" : size === "sm" ? "h-9 w-8" : "h-12 w-10";
  return (
    <span className={`relative flex flex-none overflow-hidden rounded-[10px] bg-[#f4eee8] ${dimensions}`}>
      {image ? (
        <Image src={image} alt={name} fill sizes="64px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[#b9aaa0]"><PackageCheck className="h-4 w-4" /></span>
      )}
    </span>
  );
}
