import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function OurStory({
  image,
  body,
}: {
  image: string;
  body: string;
}) {
  return (
    <section className="mx-auto max-w-brand px-6 py-24 lg:px-10 lg:py-32">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2px] lg:col-span-7">
          <Image
            src={image}
            alt="Inside MARGA Studio's atelier in Cairo"
            fill
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover"
          />
        </div>

        <div className="lg:col-span-5">
          <h2 className="text-[2rem] font-medium tracking-tight text-charcoal lg:text-[2.4rem]">
            Our Story
          </h2>
          <p className="mt-6 text-[15px] font-light leading-[1.9] text-charcoal/75 lg:text-base">
            {body}
          </p>
          <a
            href="#"
            className="mt-8 inline-flex items-center gap-2 text-[13px] font-medium tracking-wide text-accentred transition-opacity hover:opacity-70"
          >
            Read the Full Story
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </a>
        </div>
      </div>
    </section>
  );
}
