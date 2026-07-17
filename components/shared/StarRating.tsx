import { Star } from "lucide-react";

const SIZE_CLASSES = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
} as const;

/**
 * Five-star rating display. `rating` is rounded to the nearest whole star.
 * Used on product cards, product detail, and reviews so the star-filling
 * logic and colors only live in one place.
 */
export default function StarRating({
  rating,
  size = "sm",
  className = "",
}: {
  rating: number;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const filled = Math.round(rating);

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={SIZE_CLASSES[size]}
          strokeWidth={0}
          fill={i < filled ? "#161513" : "#E7E4DE"}
        />
      ))}
    </div>
  );
}
