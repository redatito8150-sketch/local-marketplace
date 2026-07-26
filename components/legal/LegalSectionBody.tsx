import type { LegalBlock } from "@/types";
import LegalRichText from "@/components/legal/LegalRichText";

// Renders the typed block list shared by both /privacy and /terms content
// files with correct semantic markup per block type (list items stay real
// <li>s, subheadings stay real headings) instead of one opaque HTML blob.
export default function LegalSectionBody({ blocks, headingLevel = "h3" }: { blocks: LegalBlock[]; headingLevel?: "h3" | "h4" }) {
  const Subheading = headingLevel;
  return (
    <div className="space-y-4 text-[14.5px] leading-relaxed text-ink-soft/80">
      {blocks.map((block, index) => {
        if (block.type === "subheading") {
          return (
            <Subheading key={index} className="pt-1 text-[13px] font-bold uppercase tracking-wide text-ink">
              <LegalRichText text={block.text} />
            </Subheading>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="list-disc space-y-2 pl-5 marker:text-mahalyred/50">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <LegalRichText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            <LegalRichText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
