import { describe, expect, it } from "vitest";
import { parseStudentsPayload } from "@/features/workspace/student-import-schema";

describe("parseStudentsPayload", () => {
  it.each([
    [null, "Nenhum aluno foi enviado"],
    ["", "Nenhum aluno foi enviado"],
    ["[]", "Nenhum aluno válido foi encontrado"],
    ["{", "dados da importação estão inválidos"],
    ['{"fullName":"Ana"}', "Não foi possível validar"],
    ['[{"registrationNumber":"1"}]', "Não foi possível validar"],
    ['[{"fullName":"A"}]', "Não foi possível validar"],
    ['[{"fullName":"Ana Clara","callNumber":0}]', "Não foi possível validar"],
  ])("rejeita payload %j sem lançar ZodError", (payload, message) => {
    const result = parseStudentsPayload(payload);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain(message);
  });

  it("aceita matrícula e chamada ausentes", () => {
    expect(parseStudentsPayload('[{"fullName":"Ana Clara"}]')).toEqual({
      success: true,
      students: [{ fullName: "Ana Clara" }],
    });
  });

  it("aceita várias linhas válidas e remove matrícula vazia", () => {
    const result = parseStudentsPayload(
      JSON.stringify([
        { fullName: "Ana Clara", registrationNumber: "", callNumber: 1 },
        { fullName: "Arthur Silva", registrationNumber: "20260002" },
      ]),
    );
    expect(result).toEqual({
      success: true,
      students: [
        { fullName: "Ana Clara", registrationNumber: undefined, callNumber: 1 },
        { fullName: "Arthur Silva", registrationNumber: "20260002" },
      ],
    });
  });
});
