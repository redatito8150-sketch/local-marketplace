import Link from "next/link";

const SIZES = {
  sm: { icon: "h-6 w-6", text: "text-lg" },
  md: { icon: "h-8 w-8 sm:h-[42px] sm:w-[42px]", text: "text-[26px] sm:text-[34px]" },
  lg: { icon: "h-10 w-10 sm:h-[50px] sm:w-[50px]", text: "text-[29px] sm:text-[37px]" },
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
    <Link href={href} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <span
        aria-hidden
        className={`${icon} shrink-0 bg-mahalyred`}
        style={{ WebkitMask: 'url("/logo.png") center / contain no-repeat', mask: 'url("/logo.png") center / contain no-repeat' }}
      />
      <span className={`${text} font-serif font-semibold tracking-tightest text-mahalyred`}>Zakhnook</span>
    </Link>
  );
}
