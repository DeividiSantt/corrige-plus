export const ANSWER_SHEET_BUCKET = "answer-sheet-uploads";
export const MAX_FILES_PER_BATCH = 50;
export const MAX_FILE_SIZE_BYTES = 12 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 900;
export const MIN_IMAGE_HEIGHT = 1200;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

export function formatFileSize(bytes: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
}
