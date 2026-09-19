import { describe, expect, it } from "vitest";
import { canIdentifyStudentManually, canReprocessFile, classifyAnswerSheetLookup } from "./qr-errors";

const sheet = {
  id: "sheet-1",
  exam_id: "exam-1",
  exam_version_id: "version-1",
  student_id: "student-1",
  status: "generated",
  purged_at: null,
};

describe("classifyAnswerSheetLookup", () => {
  it("diferencia uma falha do banco de um token inexistente", () => {
    expect(classifyAnswerSheetLookup({ sheet: null, sheetError: { code: "PGRST000" }, batchExamId: "exam-1" }))
      .toBe("QR_DATABASE_ERROR");
    expect(classifyAnswerSheetLookup({ sheet: null, sheetError: null, batchExamId: "exam-1" }))
      .toBe("INVALID_QR_TOKEN");
  });

  it("detecta cartão de outra prova e duplicidade", () => {
    expect(classifyAnswerSheetLookup({ sheet: { ...sheet, exam_id: "exam-2" }, sheetError: null, batchExamId: "exam-1" }))
      .toBe("WRONG_EXAM");
    expect(classifyAnswerSheetLookup({ sheet: { ...sheet, status: "confirmed" }, sheetError: null, batchExamId: "exam-1" }))
      .toBe("DUPLICATE_SHEET");
    expect(classifyAnswerSheetLookup({ sheet: { ...sheet, manually_changed: true }, sheetError: null, batchExamId: "exam-1" }))
      .toBe("DUPLICATE_SHEET");
  });

  it("libera um cartão válido da avaliação atual", () => {
    expect(classifyAnswerSheetLookup({ sheet, sheetError: null, batchExamId: "exam-1" })).toBeNull();
  });

  it("oferece reprocessamento somente para falhas técnicas recuperáveis", () => {
    expect(canReprocessFile("failed", "qr_not_detected")).toBe(true);
    expect(canReprocessFile("failed", "CORRECTION_SERVICE_TIMEOUT")).toBe(true);
    expect(canReprocessFile("completed", "CORRECTION_SERVICE_TIMEOUT")).toBe(false);
    expect(canReprocessFile("review_required", "qr_not_detected")).toBe(false);
    expect(canReprocessFile("failed", "STORED_FILE_NOT_FOUND")).toBe(false);
  });

  it("permite identificar o aluno apenas quando o QR falhou", () => {
    expect(canIdentifyStudentManually("review_required", "qr_not_detected")).toBe(true);
    expect(canIdentifyStudentManually("failed", "qr_detected_not_decoded")).toBe(true);
    expect(canIdentifyStudentManually("failed", "document_not_found")).toBe(false);
    expect(canIdentifyStudentManually("completed", "qr_not_detected")).toBe(false);
  });
});

describe("classifyAnswerSheetLookup — reset", () => {
  it("libera cartão purgado da mesma avaliação e mantém outra avaliação bloqueada", () => {
    expect(classifyAnswerSheetLookup({ sheet: { ...sheet, exam_id: "exam-2", status: "corrected", purged_at: "2026-07-25T18:00:00Z" }, sheetError: null, batchExamId: "exam-1" })).toBe("WRONG_EXAM");
    expect(classifyAnswerSheetLookup({ sheet: { ...sheet, status: "corrected", purged_at: "2026-07-25T18:00:00Z" }, sheetError: null, batchExamId: "exam-1" })).toBeNull();
  });

  it("continua bloqueando cartões ativos protegidos", () => {
    for (const status of ["corrected", "review_required", "confirmed"]) {
      expect(classifyAnswerSheetLookup({ sheet: { ...sheet, status, purged_at: null }, sheetError: null, batchExamId: "exam-1" })).toBe("DUPLICATE_SHEET");
    }
  });
});
