"use client";

import { useState } from "react";
import { normalizeTotpCode, TOTP_CODE_LENGTH } from "@/lib/auth/oneTimeCode";

interface TotpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}

export default function TotpCodeInput({ value, onChange, disabled = false, invalid = false }: TotpCodeInputProps) {
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, TOTP_CODE_LENGTH - 1);

  return (
    <label className="relative mt-7 block" aria-label="6-digit authentication code">
      <span className="grid grid-cols-6 gap-2 sm:gap-3" aria-hidden="true">
        {Array.from({ length: TOTP_CODE_LENGTH }, (_, index) => {
          const digit = value[index] ?? "";
          const active = focused && index === activeIndex;

          return (
            <span
              key={index}
              className={`grid aspect-square min-w-0 place-items-center rounded-2xl border bg-white text-xl font-semibold tabular-nums text-ink shadow-sm transition sm:text-2xl ${
                invalid
                  ? "border-red-400 ring-2 ring-red-100"
                  : active
                    ? "border-mahalyred ring-4 ring-mahalyred/10"
                    : digit
                      ? "border-mahalyred/35"
                      : "border-[#d9cfc4]"
              }`}
            >
              {digit}
            </span>
          );
        })}
      </span>

      <input
        suppressHydrationWarning
        type="text"
        name="totp"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={TOTP_CODE_LENGTH}
        required
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(normalizeTotpCode(event.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="6-digit authentication code"
        aria-invalid={invalid}
        className="absolute inset-0 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
      />
    </label>
  );
}
