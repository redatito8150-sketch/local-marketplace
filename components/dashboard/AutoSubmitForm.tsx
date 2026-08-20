"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type AutoSubmitFormProps = {
  action: string;
  children: ReactNode;
  className?: string;
  searchDelay?: number;
};

export default function AutoSubmitForm({ action, children, className = "", searchDelay = 320 }: AutoSubmitFormProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function submit(form: HTMLFormElement) {
    if (timer.current) clearTimeout(timer.current);
    setUpdating(true);
    form.requestSubmit();
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name || target.dataset.noAutoSubmit === "true" || target.type === "hidden") return;
    const form = event.currentTarget;
    if (target instanceof HTMLInputElement && ["search", "text", "number"].includes(target.type)) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => submit(form), searchDelay);
      return;
    }
    submit(form);
  }

  return (
    <form
      action={action}
      data-auto-submit="true"
      data-dashboard-filters="true"
      onChange={handleChange}
      className={className}
      aria-busy={updating}
    >
      {children}
      <span className="sr-only" role="status" aria-live="polite">{updating ? "Updating results" : ""}</span>
    </form>
  );
}
