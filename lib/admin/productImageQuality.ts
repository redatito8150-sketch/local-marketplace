export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MIN_WIDTH = 600;
export const PRODUCT_IMAGE_MIN_HEIGHT = 750;
export const PRODUCT_IMAGE_RECOMMENDED_WIDTH = 1200;
export const PRODUCT_IMAGE_RECOMMENDED_HEIGHT = 1500;

export type ProductImageQuality = {
  width: number;
  height: number;
  level: "good" | "warning" | "error";
  label: string;
  detail: string;
};

export function assessProductImageDimensions(width: number, height: number): ProductImageQuality {
  const ratio = width / height;
  if (width < PRODUCT_IMAGE_MIN_WIDTH || height < PRODUCT_IMAGE_MIN_HEIGHT) {
    return {
      width,
      height,
      level: "error",
      label: "Too small",
      detail: `Use at least ${PRODUCT_IMAGE_MIN_WIDTH} × ${PRODUCT_IMAGE_MIN_HEIGHT}px.`,
    };
  }
  if (ratio < 0.68 || ratio > 0.92) {
    return {
      width,
      height,
      level: "warning",
      label: "Check crop",
      detail: "The storefront uses a 4:5 frame, so this image will be cropped.",
    };
  }
  if (width < PRODUCT_IMAGE_RECOMMENDED_WIDTH || height < PRODUCT_IMAGE_RECOMMENDED_HEIGHT) {
    return {
      width,
      height,
      level: "warning",
      label: "Usable",
      detail: `For sharper zoom, use ${PRODUCT_IMAGE_RECOMMENDED_WIDTH} × ${PRODUCT_IMAGE_RECOMMENDED_HEIGHT}px or larger.`,
    };
  }
  return { width, height, level: "good", label: "Great quality", detail: "Sharp 4:5 storefront crop." };
}

