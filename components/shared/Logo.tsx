import Image from "next/image";
import Link from "next/link";

const SIZES = {
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 42, text: "text-[34px]" },
  lg: { icon: 50, text: "text-[39px]" },
} as const;

export default function Logo({
  size = "md",
  href = "/#home",
}: {
  size?: keyof typeof SIZES;
  href?: string;
}) {
  const { icon, text } = SIZES[size];
  const responsiveIcon =
    size === "lg"
      ? "h-10 w-10 sm:h-[50px] sm:w-[50px]"
      : size === "md"
        ? "h-8 w-8 sm:h-[42px] sm:w-[42px]"
        : "";
  const responsiveText =
    size === "lg"
      ? "text-[29px] sm:text-[39px]"
      : size === "md"
        ? "text-[26px] sm:text-[34px]"
        : text;
  return (
    <Link href={href} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Image src="/logo.png" alt="Mahaly" width={icon} height={icon} priority className={`shrink-0 ${responsiveIcon}`} />
      <span className={`${responsiveText} font-serif font-semibold tracking-tightest text-mahalyred`}>Mahaly</span>
    </Link>
  );
}
