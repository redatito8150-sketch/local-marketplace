import { Quote } from "lucide-react";
import { SUCCESS_STORY } from "@/content/join";

export default function SuccessStory() {
  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold text-ink lg:text-3xl">
        Success stories
      </h2>

      <Quote className="mt-6 h-7 w-7 text-ink/20" strokeWidth={1.5} fill="currentColor" />

      <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-soft/80">
        {SUCCESS_STORY.quote}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-beige-100 text-[15px] font-semibold text-ink">
          {SUCCESS_STORY.initial}
        </span>
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{SUCCESS_STORY.name}</p>
          <p className="text-[12.5px] text-ink-soft/60">{SUCCESS_STORY.role}</p>
        </div>
      </div>
    </div>
  );
}
