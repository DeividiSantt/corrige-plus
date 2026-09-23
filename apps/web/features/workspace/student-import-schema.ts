import { z } from "zod";

export const importedStudentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome do aluno.")
    .max(180, "O nome do aluno deve ter no máximo 180 caracteres."),
  registrationNumber: z
    .string()
    .trim()
    .max(80, "A matrícula deve ter no máximo 80 caracteres.")
    .optional(),
  callNumber: z
    .number()
    .int("O número da chamada deve ser inteiro.")
    .min(1, "O número da chamada deve começar em 1.")
    .max(9999, "O número da chamada deve ser menor que 10.000.")
    .optional(),
});

export const importedStudentsSchema = z
  .array(importedStudentSchema)
  .min(1, "Nenhum aluno válido foi encontrado.");

export type ImportedStudent = z.output<typeof importedStudentSchema>;

export type StudentPayloadParseResult =
  | { success: true; students: ImportedStudent[] }
  | { success: false; message: string; fieldErrors?: Record<string, string[]> };

export function parseStudentsPayload(
  rawPayload: FormDataEntryValue | null,
): StudentPayloadParseResult {
  if (typeof rawPayload !== "string" || rawPayload.trim() === "") {
    return {
      success: false,
      message: "Nenhum aluno foi enviado para importação.",
    };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(rawPayload);
  } catch {
    return {
      success: false,
      message: "Os dados da importação estão inválidos. Selecione o arquivo novamente.",
    };
  }

  const validation = importedStudentsSchema.safeParse(parsedPayload);
  if (!validation.success) {
    const isEmptyArray = Array.isArray(parsedPayload) && parsedPayload.length === 0;
    const flattened = z.flattenError(validation.error);
    const fieldErrors = Object.fromEntries(
      Object.entries(flattened.fieldErrors)
        .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
        .map(([field, errors]) => [field, errors]),
    );
    return {
      success: false,
      message: isEmptyArray
        ? "Nenhum aluno válido foi encontrado. Confira os cabeçalhos e os dados da planilha."
        : "Não foi possível validar os alunos da planilha.",
      fieldErrors,
    };
  }

  return {
    success: true,
    students: validation.data.map((student) => ({
      ...student,
      registrationNumber: student.registrationNumber || undefined,
    })),
  };
}
