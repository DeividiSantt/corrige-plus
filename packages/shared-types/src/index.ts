export type UserRole = "teacher" | "organization_admin" | "platform_admin";

export type ExamStatus =
  | "draft"
  | "ready"
  | "applied"
  | "processing"
  | "completed"
  | "archived";

export type AnswerSheetStatus =
  | "generated"
  | "uploaded"
  | "queued"
  | "processing"
  | "corrected"
  | "review_required"
  | "failed"
  | "confirmed";

export type ProcessingFileStatus =
  | "waiting"
  | "processing"
  | "completed"
  | "review_required"
  | "failed";

export type ProcessingErrorCode =
  | "QR_CODE_NOT_FOUND"
  | "INVALID_QR_TOKEN"
  | "ANSWER_SHEET_NOT_FOUND"
  | "CORNER_MARKERS_NOT_FOUND"
  | "IMAGE_TOO_BLURRY"
  | "IMAGE_TOO_DARK"
  | "IMAGE_CROPPED"
  | "INVALID_FILE_TYPE"
  | "DUPLICATE_SUBMISSION"
  | "PROCESSING_ERROR";
