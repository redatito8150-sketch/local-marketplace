"use client";

// Per-field validation message. Pair with `aria-invalid={Boolean(error)}`
// and `aria-describedby={error ? id : undefined}` on the input itself
// (the `id` prop here must match) — no form in the codebase wired
// aria-invalid before this component existed, per the discovery pass.
export default function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-[12px] font-medium text-red-600">
      {error}
    </p>
  );
}
