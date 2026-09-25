"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { workspaceData } from "@/features/workspace/data";
import { createStudentImportPlan } from "@/features/workspace/student-import-plan";
import { parseMultiClassImportPayload } from "@/features/workspace/multi-class-import-schema";
import { parseStudentsPayload } from "@/features/workspace/student-import-schema";

export type StudentImportActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  importedCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  conflictCount?: number;
  warnings?: string[];
};

export type MultiClassImportActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

async function context() {
  try {
    const { supabase, userId, organizationId } = await workspaceData();
    return { supabase, userId, organizationId };
  } catch {
    redirect("/login");
  }
}

export async function createClassAction(formData: FormData) {
  const input = z.object({ name: z.string().min(1), grade: z.string().min(1), schoolYear: z.coerce.number().int(), shift: z.enum(["morning", "afternoon", "evening", "full_time", "other"]), subject: z.string().optional() }).parse(Object.fromEntries(formData));
  const { supabase, userId, organizationId } = await context();
  const { error } = await supabase.from("classes").insert({ organization_id: organizationId, created_by: userId, name: input.name, grade: input.grade, school_year: input.schoolYear, shift: input.shift, subject: input.subject || null });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/turmas");
}

export async function deleteClassAction(formData: FormData) {
  const classId = z.string().uuid().parse(formData.get("classId"));
  const { supabase } = await context();
  const { error } = await supabase.rpc("soft_delete_class", { target_id: classId });
  if (error) throw new Error("Não foi possível arquivar a turma. Tente novamente.");
  revalidatePath("/dashboard/turmas");
  revalidatePath("/dashboard/alunos");
  revalidatePath("/dashboard/avaliacoes");
}

export async function importStudentsAction(
  _previousState: StudentImportActionState,
  formData: FormData,
): Promise<StudentImportActionState> {
  const payload = parseStudentsPayload(formData.get("studentsPayload"));
  if (!payload.success) {
    return {
      status: "error",
      message: payload.message,
      fieldErrors: payload.fieldErrors,
    };
  }

  const classValidation = z.string().uuid().safeParse(formData.get("classId"));
  if (!classValidation.success) {
    return { status: "error", message: "Selecione uma turma válida para continuar." };
  }

  const classId = classValidation.data;
  const { supabase, organizationId } = await context();
  const { data: targetClass, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (classError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[student-import] class_lookup_failed", {
        code: classError.code,
        message: classError.message,
      });
    }
    return { status: "error", message: "Não foi possível verificar a turma selecionada. Tente novamente." };
  }
  if (!targetClass) {
    return {
      status: "error",
      message: "A turma selecionada não existe ou você não possui acesso a ela.",
    };
  }

  const registrations = [
    ...new Set(
      payload.students
        .map((student) => student.registrationNumber)
        .filter((registration): registration is string => Boolean(registration)),
    ),
  ];
  let existingStudents: { id: string; class_id: string; registration_number: string | null }[] = [];

  if (registrations.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .select("id,class_id,registration_number")
      .eq("organization_id", organizationId)
      .in("registration_number", registrations)
      .is("deleted_at", null);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[student-import] duplicate_lookup_failed", {
          code: error.code,
          message: error.message,
          registrationCount: registrations.length,
        });
      }
      return {
        status: "error",
        message: "Não foi possível verificar matrículas já cadastradas. Tente novamente.",
      };
    }
    existingStudents = data ?? [];
  }

  const plan = createStudentImportPlan(payload.students, existingStudents, classId);
  const warnings: string[] = [];
  let importedCount = 0;
  let updatedCount = 0;
  let concurrentConflictCount = 0;

  for (const update of plan.updates) {
    const { error } = await supabase
      .from("students")
      .update({
        full_name: update.student.fullName,
        registration_number: update.student.registrationNumber ?? null,
        call_number: update.student.callNumber ?? null,
      })
      .eq("id", update.existingId)
      .eq("organization_id", organizationId)
      .eq("class_id", classId);
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[student-import] update_failed", { code: error.code, message: error.message });
      }
      return {
        status: "error",
        message: "Não foi possível concluir a importação. Tente novamente.",
        importedCount,
        updatedCount,
        warnings: ["Parte da operação pode ter sido concluída antes do erro."],
      };
    }
    updatedCount += 1;
  }

  if (plan.newWithRegistration.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .upsert(
        plan.newWithRegistration.map((student) => ({
          organization_id: organizationId,
          class_id: classId,
          full_name: student.fullName,
          registration_number: student.registrationNumber,
          call_number: student.callNumber ?? null,
        })),
        {
          onConflict: "organization_id,registration_number",
          ignoreDuplicates: true,
        },
      )
      .select("id");
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[student-import] insert_registered_failed", {
          code: error.code,
          message: error.message,
          rowCount: plan.newWithRegistration.length,
        });
      }
      return {
        status: "error",
        message: "Não foi possível concluir a importação. Tente novamente.",
        importedCount,
        updatedCount,
        warnings: ["Parte da operação pode ter sido concluída antes do erro."],
      };
    }
    importedCount += data?.length ?? 0;
    concurrentConflictCount = plan.newWithRegistration.length - (data?.length ?? 0);
  }

  if (plan.newWithoutRegistration.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .insert(
        plan.newWithoutRegistration.map((student) => ({
          organization_id: organizationId,
          class_id: classId,
          full_name: student.fullName,
          registration_number: null,
          call_number: student.callNumber ?? null,
        })),
      )
      .select("id");
    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[student-import] insert_without_registration_failed", {
          code: error.code,
          message: error.message,
          rowCount: plan.newWithoutRegistration.length,
        });
      }
      return {
        status: "error",
        message: "Não foi possível concluir a importação. Tente novamente.",
        importedCount,
        updatedCount,
        warnings: ["Parte da operação pode ter sido concluída antes do erro."],
      };
    }
    importedCount += data?.length ?? 0;
  }

  const conflictCount = plan.conflicts.length + concurrentConflictCount;
  const skippedCount = conflictCount + plan.duplicatePayloadRows.length;
  if (plan.conflicts.length > 0) {
    warnings.push(
      `${plan.conflicts.length} aluno(s) foram ignorados porque a matrícula já pertence a outra turma.`,
    );
  }
  if (concurrentConflictCount > 0) {
    warnings.push(
      `${concurrentConflictCount} matrícula(s) foram cadastradas por outra operação e não foram alteradas.`,
    );
  }
  if (plan.duplicatePayloadRows.length > 0) {
    warnings.push(
      `${plan.duplicatePayloadRows.length} linha(s) duplicadas no envio foram ignoradas.`,
    );
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[student-import] completed", {
      receivedRows: payload.students.length,
      importedCount,
      updatedCount,
      skippedCount,
      conflictCount,
    });
  }

  revalidatePath("/dashboard/alunos");
  return {
    status: "success",
    message: "Importação concluída.",
    importedCount,
    updatedCount,
    skippedCount,
    conflictCount,
    warnings,
  };
}

export async function importClassesAndStudentsAction(
  _previousState: MultiClassImportActionState,
  formData: FormData,
): Promise<MultiClassImportActionState> {
  const payload = parseMultiClassImportPayload(formData.get("groupsPayload"));
  if (!payload.success) return { status: "error", message: payload.message };

  const { supabase, organizationId } = await context();
  const { data, error } = await supabase.rpc("import_class_roster_batch", {
    p_organization_id: organizationId,
    p_groups: payload.groups.map((group) => ({
      name: group.name,
      grade: group.grade,
      shift: group.shift,
      school_year: group.schoolYear,
      students: group.students.map((student) => ({
        full_name: student.fullName,
        registration_number: student.registrationNumber ?? null,
        call_number: student.callNumber ?? null,
      })),
    })),
  });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[multi-class-import] batch_failed", { code: error.code, message: error.message });
    }
    return { status: "error", message: "Não foi possível importar as turmas. Confira se alguma matrícula já pertence a outra turma." };
  }

  const summary = data as { classes_created?: number; classes_updated?: number; students_created?: number; students_updated?: number } | null;
  revalidatePath("/dashboard/turmas");
  revalidatePath("/dashboard/alunos");
  revalidatePath("/dashboard/configurar-avaliacao");
  return {
    status: "success",
    message: `${summary?.classes_created ?? 0} turma(s) criada(s), ${summary?.classes_updated ?? 0} atualizada(s), ${summary?.students_created ?? 0} aluno(s) criado(s) e ${summary?.students_updated ?? 0} atualizado(s).`,
  };
}

export async function createExamAction(formData: FormData) {
  const input = z.object({
    classId: z.string().uuid(),
    title: z.string().min(2),
    subject: z.string().min(1),
    examDate: z.string().optional(),
    totalQuestions: z.coerce.number().int().min(1).max(50),
    totalScore: z.coerce.number().positive(),
    answers: z.string().min(1),
    isMultidisciplinary: z.enum(["true", "false"]).default("false"),
    blocks: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const answers = input.answers.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  if (answers.length !== input.totalQuestions || answers.some((answer) => !/^[A-E]$/.test(answer))) throw new Error("Informe uma alternativa de A a E para cada questão.");
  const isMultidisciplinary = input.isMultidisciplinary === "true";
  const blockSchema = z.object({
    subject: z.string().trim().min(2).max(120),
    questionCount: z.coerce.number().int().min(1).max(50),
  });
  let subjectBlocks: { subject: string; questionCount: number }[] = [];
  if (isMultidisciplinary) {
    let parsedBlocks: unknown;
    try {
      parsedBlocks = JSON.parse(input.blocks || "[]");
    } catch {
      throw new Error("Não foi possível ler os blocos por matéria. Confira os dados e tente novamente.");
    }
    subjectBlocks = z.array(blockSchema).min(2).max(20).parse(parsedBlocks);
    const blockQuestionTotal = subjectBlocks.reduce((total, block) => total + block.questionCount, 0);
    if (blockQuestionTotal !== input.totalQuestions) throw new Error("A soma das questões dos blocos precisa ser igual ao total da avaliação.");
    if (![10, 20, 30, 40, 50].includes(blockQuestionTotal)) throw new Error("A prova por blocos deve ter 10, 20, 30, 40 ou 50 questões no total.");
  }
  const { supabase, userId, organizationId } = await context();
  const { data: exam, error: examError } = await supabase.from("exams").insert({ organization_id: organizationId, class_id: input.classId, created_by: userId, title: input.title, subject: input.subject, exam_date: input.examDate || null, total_questions: input.totalQuestions, total_score: input.totalScore, status: "ready" }).select("id").single();
  if (examError || !exam) throw new Error(examError?.message || "Não foi possível criar a avaliação.");
  const { data: version, error: versionError } = await supabase.from("exam_versions").insert({ exam_id: exam.id, name: "Versão A", code: "A" }).select("id").single();
  if (versionError || !version) throw new Error(versionError?.message || "Não foi possível criar a versão.");
  if (subjectBlocks.length) {
    let firstQuestion = 1;
    const { error: blocksError } = await supabase.from("exam_subject_blocks").insert(
      subjectBlocks.map((block, index) => {
        const startQuestionNumber = firstQuestion;
        const endQuestionNumber = firstQuestion + block.questionCount - 1;
        firstQuestion = endQuestionNumber + 1;
        return {
          exam_version_id: version.id,
          subject: block.subject,
          position: index + 1,
          start_question_number: startQuestionNumber,
          end_question_number: endQuestionNumber,
        };
      }),
    );
    if (blocksError) throw new Error("Não foi possível salvar os blocos por matéria. Tente novamente.");
  }
  const score = input.totalScore / input.totalQuestions;
  const { error: questionsError } = await supabase.from("exam_questions").insert(answers.map((correct_answer, index) => ({ exam_version_id: version.id, question_number: index + 1, correct_answer, score_value: score })));
  if (questionsError) throw new Error(questionsError.message);
  const { data: students } = await supabase.from("students").select("id").eq("class_id", input.classId).eq("status", "active");
  if (students?.length) {
    const { error: sheetsError } = await supabase.from("answer_sheets").insert(students.map((student) => ({ organization_id: organizationId, exam_id: exam.id, exam_version_id: version.id, class_id: input.classId, student_id: student.id })));
    if (sheetsError) throw new Error(sheetsError.message);
  }
  revalidatePath("/dashboard/avaliacoes");
  redirect(`/dashboard/avaliacoes/${exam.id}/cartoes`);
}

export async function deleteExamAction(formData: FormData) {
  const examId = z.string().uuid().parse(formData.get("examId"));
  const { supabase } = await context();
  const { error } = await supabase.rpc("soft_delete_exam", { target_id: examId });
  if (error) throw new Error("Não foi possível arquivar a avaliação. Tente novamente.");
  revalidatePath("/dashboard/avaliacoes");
  revalidatePath("/dashboard/corrigir-provas");
  revalidatePath("/dashboard/exportacoes");
}

export async function deleteProcessingFileAction(formData: FormData) {
  const fileId = z.string().uuid().parse(formData.get("processingFileId"));
  const { supabase } = await context();
  const { data: file, error: fileError } = await supabase
    .from("processing_files")
    .select("id,status,storage_key,file_hash,answer_sheet_id,batch_id")
    .eq("id", fileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fileError || !file) throw new Error("Cartão não encontrado ou sem permissão para excluí-lo.");

  if (file.storage_key) {
    await supabase.storage.from("answer-sheet-uploads").remove([file.storage_key]);
  }
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("processing_files")
    .update({
      deleted_at: now,
      deletion_reason: "user_requested",
      final_status_before_deletion: file.status,
      storage_key: null,
      file_hash: null,
      status: "purged",
      purged_at: now,
    })
    .eq("id", fileId);
  if (updateError) throw new Error("Não foi possível excluir o cartão. Tente novamente.");

  if (file.answer_sheet_id) {
    await supabase
      .from("answer_sheets")
      .update({ deleted_at: now, status: "purged", purged_at: now })
      .eq("id", file.answer_sheet_id);
  }
  await supabase.from("review_items").update({ status: "dismissed", resolved_at: now }).eq("processing_file_id", fileId);
  revalidatePath("/dashboard/historico-cartoes");
  revalidatePath(`/dashboard/corrigir-provas/lotes/${file.batch_id}`);
  revalidatePath("/dashboard/revisao");
  revalidatePath("/dashboard/exportacoes");
}

/**
 * Clears only the stored correction result for a card. The answer sheet,
 * student, exam, secure token and uploaded file remain available for a new
 * submission. Ownership is enforced by Supabase RLS and the organization
 * check below.
 */
export async function resetAnswerSheetResultAction(formData: FormData) {
  const processingFileId = z.string().uuid().parse(formData.get("processingFileId"));
  const { supabase, organizationId } = await context();
  const { data: file, error: fileError } = await supabase
    .from("processing_files")
    .select("id,answer_sheet_id")
    .eq("id", processingFileId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fileError || !file?.answer_sheet_id) {
    throw new Error("Resultado não encontrado ou sem permissão para alterá-lo.");
  }

  const now = new Date().toISOString();
  const { error: resetError } = await supabase
    .from("answer_sheets")
    .update({
      status: "generated",
      result_status: "awaiting_upload",
      score: null,
      correct_answers: null,
      incorrect_answers: null,
      blank_answers: null,
      invalidated_answers: 0,
      review_required: false,
      manually_changed: false,
      final_score_override: null,
      final_score_override_reason: null,
      processed_at: null,
      purged_at: null,
      updated_at: now,
    })
    .eq("id", file.answer_sheet_id)
    .eq("organization_id", organizationId);

  if (resetError) {
    throw new Error("Não foi possível limpar o resultado. Tente novamente.");
  }

  const { error: answersError } = await supabase
    .from("detected_answers")
    .delete()
    .eq("answer_sheet_id", file.answer_sheet_id);
  if (answersError) {
    throw new Error("O resultado foi resetado, mas as respostas detectadas não puderam ser removidas.");
  }

  await supabase
    .from("review_items")
    .update({ status: "dismissed", resolved_at: now })
    .eq("answer_sheet_id", file.answer_sheet_id)
    .neq("status", "dismissed");

  revalidatePath("/dashboard/historico-cartoes");
  revalidatePath("/dashboard/exportacoes");
  revalidatePath("/dashboard/revisao");
  revalidatePath("/dashboard/corrigir-provas");
}

export async function resetAllAnswerSheetResultsAction() {
  const { supabase, organizationId } = await context();
  const { data: sheets, error: lookupError } = await supabase
    .from("answer_sheets")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("status", ["corrected", "review_required", "confirmed"]);

  if (lookupError) throw new Error("Não foi possível localizar os resultados para limpar.");
  const ids = (sheets || []).map((sheet) => sheet.id);
  if (ids.length === 0) return;

  const now = new Date().toISOString();
  const { error: resetError } = await supabase
    .from("answer_sheets")
    .update({
      status: "generated",
      result_status: "awaiting_upload",
      score: null,
      correct_answers: null,
      incorrect_answers: null,
      blank_answers: null,
      invalidated_answers: 0,
      review_required: false,
      manually_changed: false,
      final_score_override: null,
      final_score_override_reason: null,
      processed_at: null,
      purged_at: null,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (resetError) throw new Error("Não foi possível limpar os resultados.");

  const { error: answersError } = await supabase.from("detected_answers").delete().in("answer_sheet_id", ids);
  if (answersError) throw new Error("Os resultados foram resetados, mas algumas respostas detectadas não puderam ser removidas.");

  await supabase
    .from("review_items")
    .update({ status: "dismissed", resolved_at: now })
    .in("answer_sheet_id", ids)
    .neq("status", "dismissed");

  revalidatePath("/dashboard/historico-cartoes");
  revalidatePath("/dashboard/exportacoes");
  revalidatePath("/dashboard/revisao");
  revalidatePath("/dashboard/corrigir-provas");
}

export async function deleteAllCorrectionUploadsAction() {
  const { supabase, organizationId } = await context();
  const { data: batches, error: batchError } = await supabase
    .from("processing_batches")
    .select("id")
    .eq("organization_id", organizationId);
  if (batchError) throw new Error("Não foi possível localizar os envios de correção.");

  const batchIds = (batches || []).map((batch) => batch.id);
  if (batchIds.length === 0) return;

  const { data: files, error: fileError } = await supabase
    .from("processing_files")
    .select("id,storage_key,status,file_hash")
    .in("batch_id", batchIds)
    .is("deleted_at", null);
  if (fileError) throw new Error("Não foi possível localizar as fotos enviadas.");

  const activeFiles = files || [];
  const storageKeys = activeFiles.map((file) => file.storage_key).filter((key): key is string => Boolean(key));
  if (storageKeys.length > 0) {
    const { error: storageError } = await supabase.storage.from("answer-sheet-uploads").remove(storageKeys);
    if (storageError) throw new Error("Não foi possível remover todas as fotos do armazenamento.");
  }

  if (activeFiles.length > 0) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("processing_files")
      .update({
        deleted_at: now,
        deletion_reason: "user_requested_photo_cleanup",
        storage_key: null,
        file_hash: null,
        status: "purged",
        purged_at: now,
      })
      .in("id", activeFiles.map((file) => file.id));
    if (updateError) throw new Error("As fotos foram removidas, mas os registros técnicos não puderam ser atualizados.");

    await supabase
      .from("review_items")
      .update({ status: "dismissed", resolved_at: now })
      .in("processing_file_id", activeFiles.map((file) => file.id))
      .neq("status", "dismissed");
  }

  revalidatePath("/dashboard/historico-cartoes");
  revalidatePath("/dashboard/corrigir-provas");
  revalidatePath("/dashboard/revisao");
}

export async function reviewAnswerAction(formData: FormData) {
  const input = z.object({ detectedAnswerId: z.string().uuid(), answer: z.enum(["A", "B", "C", "D", "E"]) }).parse(Object.fromEntries(formData));
  const { supabase, userId } = await context();
  const { error } = await supabase.from("detected_answers").update({ detected_answer: input.answer, manually_reviewed: true, reviewed_by: userId, reviewed_at: new Date().toISOString(), result: "correct" }).eq("id", input.detectedAnswerId);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/revisao");
  revalidatePath("/dashboard/resultados");
}

/** Confirma o resultado de uma questão após a conferência visual do cartão. */
export async function setManualAnswerResultAction(formData: FormData) {
  const input = z.object({
    reviewItemId: z.string().uuid(),
    detectedAnswerId: z.string().uuid(),
    decisionType: z.enum(["answer", "blank", "multiple"]),
    answer: z.enum(["A", "B", "C", "D", "E"]).optional(),
    multipleAnswers: z.string().optional(),
  }).parse(Object.fromEntries(formData));
  const { supabase, userId, organizationId } = await context();
  const now = new Date().toISOString();

  const confirmedAnswers = input.decisionType === "answer"
    ? input.answer ? [input.answer] : []
    : input.decisionType === "multiple"
      ? [...new Set((input.multipleAnswers || "").split(",").map((answer) => answer.trim().toUpperCase()).filter((answer) => /^[A-E]$/.test(answer)))].sort()
      : [];
  if ((input.decisionType === "answer" && confirmedAnswers.length !== 1) || (input.decisionType === "multiple" && confirmedAnswers.length < 2)) {
    throw new Error("Informe a marcação que aparece no cartão antes de salvar.");
  }

  const { data: item, error: itemError } = await supabase
    .from("review_items")
    .select("id,answer_sheet_id,processing_file_id,question_number")
    .eq("id", input.reviewItemId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .maybeSingle();
  if (itemError || !item?.answer_sheet_id || !item.question_number) {
    throw new Error("Esta revisão não está mais disponível.");
  }

  const { data: answer, error: answerError } = await supabase
    .from("detected_answers")
    .select("id,answer_sheet_id,question_number,detected_answer,correct_answer,classification,confidence,fill_percentages,crop_coordinates")
    .eq("id", input.detectedAnswerId)
    .eq("answer_sheet_id", item.answer_sheet_id)
    .eq("question_number", item.question_number)
    .maybeSingle();
  if (answerError || !answer) throw new Error("Não foi possível localizar a resposta desta questão.");

  const { data: sheet, error: sheetError } = await supabase
    .from("answer_sheets")
    .select("id,exam_version_id,layout_version,algorithm_version")
    .eq("id", item.answer_sheet_id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (sheetError || !sheet) throw new Error("Não foi possível localizar os dados da avaliação.");

  const reviewedResult = input.decisionType === "blank"
    ? "blank"
    : input.decisionType === "multiple"
      ? "multiple"
      : confirmedAnswers[0] === answer.correct_answer ? "correct" : "incorrect";

  const { error: answerUpdateError } = await supabase
    .from("detected_answers")
    .update({
      detected_answer: input.decisionType === "answer" ? confirmedAnswers[0] : null,
      result: reviewedResult,
      manually_reviewed: true,
      reviewed_by: userId,
      reviewed_at: now,
    })
    .eq("id", answer.id);
  if (answerUpdateError) throw new Error("Não foi possível salvar a decisão da questão.");

  const { error: calibrationError } = await supabase
    .from("calibration_examples")
    .upsert({
      organization_id: organizationId,
      review_item_id: item.id,
      answer_sheet_id: item.answer_sheet_id,
      processing_file_id: item.processing_file_id,
      question_number: item.question_number,
      detected_answer: answer.detected_answer,
      confirmed_answers: confirmedAnswers,
      confirmed_kind: input.decisionType,
      original_classification: answer.classification,
      original_confidence: answer.confidence,
      fill_percentages: answer.fill_percentages,
      crop_coordinates: answer.crop_coordinates,
      layout_version: sheet.layout_version,
      algorithm_version: sheet.algorithm_version,
      confirmed_by: userId,
      confirmed_at: now,
    }, { onConflict: "review_item_id" });
  if (calibrationError) throw new Error("A resposta foi atualizada, mas o exemplo de calibração não pôde ser salvo. Tente novamente.");

  const { error: reviewUpdateError } = await supabase
    .from("review_items")
    .update({ status: "resolved", resolved_at: now, resolved_by: userId })
    .eq("id", item.id);
  if (reviewUpdateError) throw new Error("A resposta foi atualizada, mas a revisão não pôde ser concluída.");

  const [{ data: answers, error: answersError }] = await Promise.all([
    supabase
      .from("detected_answers")
      .select("question_number,result")
      .eq("answer_sheet_id", item.answer_sheet_id),
  ]);
  if (answersError) throw new Error("A decisão foi salva, mas não foi possível recalcular a nota.");

  const { data: questions, error: questionsError } = await supabase
    .from("exam_questions")
    .select("question_number,score_value,is_cancelled")
    .eq("exam_version_id", sheet.exam_version_id);
  if (questionsError) throw new Error("A decisão foi salva, mas não foi possível consultar o gabarito.");

  const scoreByQuestion = new Map((questions || []).map((question) => [question.question_number, Number(question.score_value || 0)]));
  const correct = (answers || []).filter((item) => item.result === "correct").length;
  const incorrect = (answers || []).filter((item) => item.result === "incorrect").length;
  const blank = (answers || []).filter((item) => item.result === "blank").length;
  const score = (answers || []).reduce(
    (total, item) => total + (item.result === "correct" ? scoreByQuestion.get(item.question_number) || 0 : 0),
    0,
  );
  const { count: pendingCount, error: pendingError } = await supabase
    .from("review_items")
    .select("id", { count: "exact", head: true })
    .eq("answer_sheet_id", item.answer_sheet_id)
    .eq("status", "pending");
  if (pendingError) throw new Error("A decisão foi salva, mas não foi possível concluir a revisão.");

  const { error: sheetUpdateError } = await supabase
    .from("answer_sheets")
    .update({
      score,
      correct_answers: correct,
      incorrect_answers: incorrect,
      blank_answers: blank,
      review_required: Boolean(pendingCount),
      status: pendingCount ? "review_required" : "confirmed",
      // `confirmed` is a lifecycle status of the answer sheet.  The
      // result-status enum records that the teacher changed the automatic
      // classification, so it must remain a valid enum value here.
      result_status: pendingCount ? "review_required" : "manually_changed",
      manually_changed: true,
      processed_at: now,
    })
    .eq("id", item.answer_sheet_id)
    .eq("organization_id", organizationId);
  if (sheetUpdateError) throw new Error("A decisão foi salva, mas a nota não pôde ser atualizada.");

  revalidatePath("/dashboard/revisao");
  revalidatePath("/dashboard/resultados");
  revalidatePath("/dashboard/exportacoes");
  revalidatePath("/dashboard/historico-cartoes");
}
