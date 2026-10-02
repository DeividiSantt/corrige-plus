export type AnswerSheetLookup = {
  id: string;
  exam_id: string;
  exam_version_id: string;
  student_id: string;
  status: string;
  manually_changed?: boolean;
  purged_at: string | null;
};

export type QRDatabaseErrorCode =
  | "INVALID_QR_TOKEN"
  | "WRONG_EXAM"
  | "DUPLICATE_SHEET"
  | "QR_DATABASE_ERROR";

export const correctionErrorMessages: Record<string, string> = {
  qr_not_detected: "O QR Code não foi localizado. Identifique o aluno manualmente ou envie outra foto.",
  qr_detected_not_decoded: "O QR Code foi localizado, mas não pôde ser lido. Tente outra foto ou identifique o aluno manualmente.",
  qr_invalid_format: "O conteúdo do QR Code não pertence ao formato seguro do CORRIGE+.",
  document_not_found: "Não foi possível localizar as bordas do cartão. Tire outra foto com os quatro cantos visíveis.",
  invalid_document_geometry: "Os marcadores foram encontrados, mas a perspectiva do cartão não pôde ser validada. Tire outra foto com a folha inteira e sem inclinação excessiva.",
  INVALID_QR_TOKEN: "O QR Code foi lido, mas o cartão não foi encontrado nesta organização.",
  WRONG_EXAM: "Este cartão pertence a outra avaliação.",
  DUPLICATE_SHEET: "Já existe um cartão confirmado para este aluno e avaliação.",
  QR_DATABASE_ERROR: "O QR Code foi lido, mas houve uma falha ao consultar o cartão. Tente novamente.",
  CORRECTION_SERVICE_UNAVAILABLE: "O cartão foi enviado, mas o serviço de correção está indisponível.",
  CORRECTION_SERVICE_TIMEOUT: "O processamento demorou mais que o esperado. Tente novamente.",
  CORRECTION_SERVICE_AUTH_FAILED: "A autenticação interna do serviço de correção falhou.",
  CORRECTION_VERSION_MISMATCH: "O serviço de correção precisa ser atualizado antes de processar este cartão.",
  CORRECTION_SERVICE_REJECTED: "O serviço de correção recusou a imagem. Tente novamente.",
  PROCESSING_ERROR: "A API encontrou uma falha interna ao processar a imagem. Consulte os logs do serviço para o diagnóstico.",
  replacement_pending_review: "A nova foto precisa de revisão antes de substituir o resultado anterior.",
  signed_image_download_failed: "A API não conseguiu baixar a foto temporária. Reenvie o cartão e tente novamente.",
  signed_image_download_unavailable: "A API não conseguiu acessar o armazenamento temporário. Tente novamente em alguns instantes.",
  API_NOT_CONFIGURED: "O serviço de correção ainda não foi configurado.",
  PROCESSING_CLAIM_ERROR: "Não foi possível reservar este cartão para processamento.",
  QUESTION_DATABASE_ERROR: "Não foi possível consultar o gabarito desta avaliação.",
  RESULT_DATABASE_ERROR: "O processamento terminou, mas o resultado não pôde ser salvo.",
  STORED_FILE_NOT_FOUND: "A imagem temporária não está mais disponível. Envie uma nova foto.",
  processing_already_started: "Este cartão já está sendo processado.",
  processing_already_completed: "Este cartão já possui um resultado.",
  result_protected: "Este resultado foi confirmado ou alterado e não pode ser reprocessado.",
};

export const RETRYABLE_ERROR_CODES = new Set([
  "qr_unreadable",
  "qr_not_detected",
  "qr_detected_not_decoded",
  "CORRECTION_SERVICE_UNAVAILABLE",
  "CORRECTION_SERVICE_TIMEOUT",
  "CORRECTION_SERVICE_AUTH_FAILED",
  "CORRECTION_VERSION_MISMATCH",
  "CORRECTION_SERVICE_REJECTED",
  "API_NOT_CONFIGURED",
  "PROCESSING_CLAIM_ERROR",
  "PROCESSING_ERROR",
  "replacement_pending_review",
  "signed_image_download_failed",
  "signed_image_download_unavailable",
]);

/**
 * Somente falhas de identificação permitem escolher o aluno manualmente.
 * Problemas com a foto ou com a leitura das respostas ainda exigem uma nova
 * imagem, para não atribuir uma correção incompleta ao aluno selecionado.
 */
export const MANUAL_IDENTIFICATION_ERROR_CODES = new Set([
  "qr_unreadable",
  "qr_not_detected",
  "qr_detected_not_decoded",
  "qr_invalid_format",
  "INVALID_QR_TOKEN",
]);

export function canReprocessFile(status: string, errorCode: string | null) {
  return status === "failed" && Boolean(errorCode && RETRYABLE_ERROR_CODES.has(errorCode));
}

export function canIdentifyStudentManually(status: string, errorCode: string | null) {
  return (
    ["failed", "review_required"].includes(status) &&
    Boolean(errorCode && MANUAL_IDENTIFICATION_ERROR_CODES.has(errorCode))
  );
}

export function classifyAnswerSheetLookup({
  sheet,
  sheetError,
  batchExamId,
}: {
  sheet: AnswerSheetLookup | null;
  sheetError: unknown;
  batchExamId: string;
}): QRDatabaseErrorCode | null {
  if (sheetError) return "QR_DATABASE_ERROR";
  if (!sheet) return "INVALID_QR_TOKEN";
  if (sheet.exam_id !== batchExamId) return "WRONG_EXAM";
  if (sheet.purged_at) return null;
  if (
    sheet.manually_changed ||
    ["corrected", "review_required", "confirmed"].includes(sheet.status)
  ) {
    return "DUPLICATE_SHEET";
  }
  return null;
}
