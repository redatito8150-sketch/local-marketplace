import Image from "next/image";
import Link from "next/link";

const SIZES = {
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 32, text: "text-2xl" },
} as const;

export default function Logo({
  size = "md",
  href = "/#home",
}: {
  size?: keyof typeof SIZES;
  href?: string;
}) {
  const { icon, text } = SIZES[size];
  return (
    <Link href={href} className="flex items-center gap-2">
      <Image src="/logo.png" alt="Mahaly" width={icon} height={icon} priority className="shrink-0" />
      <span className={`${text} font-bold tracking-tightest text-mahalyred`}>Mahaly</span>
    </Link>
  );
}
