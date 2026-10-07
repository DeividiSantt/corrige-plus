export const ANSWER_SHEET_BUCKET = "answer-sheet-uploads";
export const MAX_FILES_PER_BATCH = 50;
export const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 900;
export const MIN_IMAGE_HEIGHT = 1200;
export const IMAGE_RESOLUTION_TOLERANCE_PX = 1;
export const MIN_ACCEPTED_IMAGE_WIDTH = MIN_IMAGE_WIDTH - IMAGE_RESOLUTION_TOLERANCE_PX;
export const MIN_ACCEPTED_IMAGE_HEIGHT = MIN_IMAGE_HEIGHT - IMAGE_RESOLUTION_TOLERANCE_PX;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export function hasMinimumImageResolution(width: number, height: number) {
  return width >= MIN_ACCEPTED_IMAGE_WIDTH && height >= MIN_ACCEPTED_IMAGE_HEIGHT;
}

export function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
}
