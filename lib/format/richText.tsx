import type { ReactNode } from "react";

// Renders the small Markdown-like subset DescriptionEditor.tsx's toolbar
// writes (**bold**, *italic*, [text](url), and "- " bullet lines) back out
// as real markup — used by both the storefront (ProductAccordion) and the
// admin Live Preview, so what the merchant sees while typing is what
// shoppers see. Deliberately not a full Markdown parser: only these 4
// constructs are recognized, matching exactly what the toolbar can produce.
const INLINE_TOKEN = /(\*\*.+?\*\*|\*.+?\*|\[.+?\]\(.+?\))/g;

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_TOKEN).filter(Boolean).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    const linkMatch = /^\[(.+)\]\((.+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

export function renderRichText(text: string): ReactNode {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const isBulletList = lines.length > 0 && lines.every((line) => line.trim().startsWith("- "));
        if (isBulletList) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-4">
              {lines.map((line, j) => (
                <li key={j}>{renderInline(line.trim().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {renderInline(block)}
          </p>
        );
      })}
    </>
  );
}
