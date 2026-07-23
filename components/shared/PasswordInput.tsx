"use client";

import { useState } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  /** Optional left-side icon (e.g. Lock), matching the public-site input style. */
  icon?: LucideIcon;
  /** Full className for the <input> itself — include right padding for the toggle button (e.g. pr-11). */
  inputClassName: string;
  wrapperClassName?: string;
  iconClassName?: string;
  toggleClassName?: string;
}

// Shared show/hide toggle for every password field in the app (registration,
// sign-in, password reset, change-password) — one place to keep the
// eye/eye-off behavior consistent instead of duplicating local state per form.
export default function PasswordInput({
  value,
  onChange,
  placeholder,
  required,
  minLength,
  autoComplete,
  icon: Icon,
  inputClassName,
  wrapperClassName = "relative",
  iconClassName = "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft/40",
  toggleClassName = "absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-soft/40 hover:text-ink-soft/70",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={wrapperClassName}>
      {Icon && <Icon className={iconClassName} />}
      <input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClassName}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className={toggleClassName}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" strokeWidth={1.6} />
        ) : (
          <Eye className="h-4 w-4" strokeWidth={1.6} />
        )}
      </button>
    </div>
  );
}
