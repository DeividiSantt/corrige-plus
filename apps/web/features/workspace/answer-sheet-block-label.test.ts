import { describe, expect, it } from "vitest";
import { answerSheetBlockLabel } from "@/features/workspace/answer-sheet-block-label";

describe("answerSheetBlockLabel", () => {
  it("mantém a faixa global de cada matéria no cartão impresso", () => {
    expect(
      answerSheetBlockLabel({
        subject: "Química",
        start_question_number: 11,
        end_question_number: 20,
      }),
    ).toBe("Química · questões 11-20");
  });
});
