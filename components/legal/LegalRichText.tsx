import LegalPlaceholder from "./LegalPlaceholder";

// Splits on [BRACKET_TOKEN] segments and renders each piece through
// LegalPlaceholder, which only applies the "pending" styling when a piece
// actually looks like an unresolved placeholder — plain sentence text
// passes through unchanged. Lets content/legal/*.ts stay plain, readable
// strings with placeholder tokens written inline.
export default function LegalRichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^[\]]+\])/g);
  return (
    <>
      {parts.map((part, i) => (
        <LegalPlaceholder key={i} value={part} />
      ))}
    </>
  );
}
