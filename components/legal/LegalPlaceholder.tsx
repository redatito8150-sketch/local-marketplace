import { isUnresolvedPlaceholder } from "@/config/legal";

// Renders a legal value with a deliberate "pending confirmation" treatment
// whenever it's still an unresolved [BRACKET] placeholder, instead of
// printing raw bracket text as if it were confirmed legal copy. Once
// config/legal.ts is updated with a real value, this renders as plain text
// automatically — nothing here needs to change.
export default function LegalPlaceholder({ value }: { value: string }) {
  if (!isUnresolvedPlaceholder(value)) return <>{value}</>;
  return (
    <span
      className="inline-block max-w-full [overflow-wrap:anywhere] rounded-full border border-dashed border-mahalyred/40 bg-mahalyred/5 px-2 py-0.5 text-[0.92em] font-medium text-mahalyred"
      title="Pending confirmation from the business/legal owner before this policy is final"
    >
      {value}
    </span>
  );
}
