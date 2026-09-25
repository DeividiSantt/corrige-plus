import { z } from "zod";
import { importedStudentsSchema } from "@/features/workspace/student-import-schema";

const importShiftSchema = z.enum(["morning", "afternoon", "evening", "full_time", "other"]);

export const multiClassImportGroupSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da turma.").max(120),
  grade: z.string().trim().min(1, "Informe a série.").max(60),
  shift: importShiftSchema,
  schoolYear: z.number().int().min(2000).max(2200),
  students: importedStudentsSchema,
});

const multiClassImportPayloadSchema = z.array(multiClassImportGroupSchema).min(1, "Selecione ao menos uma turma.");

export type MultiClassImportPayload = z.output<typeof multiClassImportPayloadSchema>;

export function parseMultiClassImportPayload(rawPayload: FormDataEntryValue | null):
  | { success: true; groups: MultiClassImportPayload }
  | { success: false; message: string } {
  if (typeof rawPayload !== "string" || !rawPayload.trim()) return { success: false, message: "Nenhuma turma foi enviada para importação." };
  try {
    const parsed = JSON.parse(rawPayload);
    const validation = multiClassImportPayloadSchema.safeParse(parsed);
    return validation.success
      ? { success: true, groups: validation.data }
      : { success: false, message: "Revise as turmas selecionadas antes de importar." };
  } catch {
    return { success: false, message: "Os dados da importação não são válidos. Selecione o arquivo novamente." };
  }
}
