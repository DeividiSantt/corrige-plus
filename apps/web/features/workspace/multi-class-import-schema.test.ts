import { describe, expect, it } from "vitest";
import { parseMultiClassImportPayload } from "@/features/workspace/multi-class-import-schema";

describe("parseMultiClassImportPayload", () => {
  it("aceita turmas completas com alunos selecionados", () => {
    const result = parseMultiClassImportPayload(JSON.stringify([{
      name: "101",
      grade: "1ª",
      shift: "morning",
      schoolYear: 2026,
      students: [{ fullName: "Ana Clara", callNumber: 1 }],
    }]));
    expect(result).toMatchObject({ success: true });
  });

  it.each([null, "", "[]", "{"])('rejeita uma carga inválida: %j', (payload) => {
    expect(parseMultiClassImportPayload(payload)).toMatchObject({ success: false });
  });
});
