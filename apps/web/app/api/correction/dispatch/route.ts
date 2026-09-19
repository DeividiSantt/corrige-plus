import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceData } from "@/features/workspace/data";
import { ANSWER_SHEET_BUCKET } from "@/features/correction/config";
import {
  classifyAnswerSheetLookup,
  correctionErrorMessages,
  type AnswerSheetLookup,
} from "@/features/correction/qr-errors";
import {
  callCorrectionService,
  CorrectionServiceError,
  getCorrectionServiceConfig,
  verifyCorrectionService,
} from "@/features/correction/service-config.server";

const requestSchema = z.object({
  processingFileId: z.string().uuid(),
  reprocess: z.boolean().default(false),
  manualAnswerSheetId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const allowAmbiguousResults = process.env.CORRECTION_ALLOW_AMBIGUOUS_RESULTS === "true";

  let workspace;
  try { workspace = await workspaceData(); } catch { return NextResponse.json({ error: "Sessão expirada." }, { status: 401 }); }
  const { supabase, userId, organizationId } = workspace;
  const { data: file } = await supabase
    .from("processing_files")
    .select("id,batch_id,storage_key,status,answer_sheet_id,attempt_count")
    .eq("id", parsed.data.processingFileId)
    .single();
  if (!file?.storage_key) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const { data: batch } = await supabase
    .from("processing_batches")
    .select("id,organization_id,exam_id,class_id,created_by")
    .eq("id", file.batch_id)
    .eq("organization_id", organizationId)
    .single();
  if (!batch || batch.created_by !== userId) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  const { data: exam } = await supabase
    .from("exams")
    .select("total_questions,alternatives_count")
    .eq("id", batch.exam_id)
    .eq("organization_id", organizationId)
    .single();
  if (!exam) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  const { data: examVersion } = await supabase
    .from("exam_versions")
    .select("id")
    .eq("exam_id", batch.exam_id)
    .eq("code", "A")
    .maybeSingle();
  const { data: subjectBlocks } = examVersion
    ? await supabase
        .from("exam_subject_blocks")
        .select("subject,start_question_number,end_question_number,position")
        .eq("exam_version_id", examVersion.id)
        .order("position")
    : { data: [] };
  const usesSubjectBlockLayout = Boolean(subjectBlocks?.length);
  let manuallyIdentifiedSheet: {
    id: string;
    exam_id: string;
    exam_version_id: string;
    student_id: string;
    status: string;
    manually_changed: boolean;
    purged_at: string | null;
    score: number | null;
    result_status: string;
  } | null = null;
  if (parsed.data.manualAnswerSheetId) {
    const { data: selectedSheet, error: selectedSheetError } = await supabase
      .from("answer_sheets")
      .select("id,exam_id,exam_version_id,student_id,status,manually_changed,purged_at,score,result_status")
      .eq("id", parsed.data.manualAnswerSheetId)
      .eq("organization_id", organizationId)
      .eq("exam_id", batch.exam_id)
      .is("deleted_at", null)
      .maybeSingle();
    const manualSelectionAllowed = ["generated", "corrected", "review_required", "confirmed", "failed"].includes(selectedSheet?.status || "");
    if (selectedSheetError || !selectedSheet || !manualSelectionAllowed || selectedSheet.purged_at) {
      return NextResponse.json({ error: "Este aluno não está disponível para identificação manual neste momento." }, { status: 409 });
    }
    manuallyIdentifiedSheet = selectedSheet;
  }

  try {
    const service = getCorrectionServiceConfig();
    const health = await verifyCorrectionService(service.url);
    const { data: signed, error: signedError } = await supabase.storage
      .from(ANSWER_SHEET_BUCKET)
      .createSignedUrl(file.storage_key, 300);
    if (signedError || !signed?.signedUrl) {
      throw new CorrectionServiceError(
        "STORED_FILE_NOT_FOUND",
        "A imagem temporária não está mais disponível. Envie uma nova foto.",
        410,
      );
    }
    const { data: claimRows, error: claimError } = await supabase.rpc("claim_processing_file", {
      p_processing_file_id: file.id,
      p_retry: parsed.data.reprocess,
      p_algorithm_version: health.pipeline_version,
    });
    if (claimError) {
      throw new CorrectionServiceError(
        "PROCESSING_CLAIM_ERROR",
        "Não foi possível reservar este cartão para processamento.",
        503,
      );
    }
    const claim = claimRows?.[0];
    if (!claim || claim.claim_status !== "claimed") {
      const code = claim?.claim_status || "processing_claim_failed";
      const message =
        correctionErrorMessages[code] ||
        (code === "retry_not_allowed"
          ? "Este cartão não está disponível para reprocessamento."
          : "Não foi possível iniciar este processamento.");
      return NextResponse.json({ error: message, code }, { status: code === "not_found" ? 404 : 409 });
    }
    if (parsed.data.reprocess) {
      const { error: dismissError } = await supabase
        .from("review_items")
        .update({
          status: "dismissed",
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq("processing_file_id", file.id)
        .eq("status", "pending");
      if (dismissError) {
        throw new CorrectionServiceError(
          "RESULT_DATABASE_ERROR",
          "Não foi possível preparar o cartão para uma nova tentativa.",
          503,
        );
      }
    }
    const result = await callCorrectionService({
      url: service.url,
      apiKey: service.apiKey,
      body: {
        processing_file_id: file.id,
        batch_id: batch.id,
        exam_id: batch.exam_id,
        owner_id: userId,
        storage_key: file.storage_key,
        signed_url: signed.signedUrl,
        layout_version: usesSubjectBlockLayout ? "corrige-plus-v2-subject-blocks" : "corrige-plus-v1",
        total_questions: exam.total_questions,
        alternatives_count: exam.alternatives_count,
        subject_blocks: subjectBlocks || [],
      },
    });
    let answerSheetId: string | null = null;
    const manualResultIsUsable = Boolean(
      manuallyIdentifiedSheet && result.answers?.length && result.error_code !== "document_not_found",
    );
    const selectedManualSheet = manualResultIsUsable ? manuallyIdentifiedSheet : null;
    if (selectedManualSheet || result.secure_token) {
      const { data: lookedUpSheet, error: sheetError } = selectedManualSheet
        ? { data: selectedManualSheet, error: null }
        : await supabase
            .from("answer_sheets")
            .select("id,exam_id,exam_version_id,student_id,status,manually_changed,purged_at,score,result_status")
            .eq("secure_token", result.secure_token)
            .eq("organization_id", organizationId)
            .is("deleted_at", null)
            .maybeSingle();
      const sheet = lookedUpSheet;
      const lookupError = classifyAnswerSheetLookup({
        sheet: sheet as AnswerSheetLookup | null,
        sheetError,
        batchExamId: batch.exam_id,
      });
      const replaceConfirmed = lookupError === "DUPLICATE_SHEET" && !parsed.data.reprocess;
      const canReplaceConfirmed =
        replaceConfirmed &&
        Boolean(result.answers?.length) &&
        result.error_code !== "document_not_found";
      if (lookupError && !selectedManualSheet && !canReplaceConfirmed) {
        result.review_required = true;
        if (replaceConfirmed) {
          result.error_code ||= "replacement_pending_review";
          result.message ||= "A nova foto foi registrada para revisão. O resultado anterior foi mantido até esta leitura ter respostas suficientes.";
        } else {
          result.error_code = lookupError;
          result.message = correctionErrorMessages[lookupError];
        }
      } else {
        if (!sheet) throw new Error("Inconsistent QR lookup state.");
        answerSheetId = sheet.id;
        if (selectedManualSheet) {
          // QR errors no longer require review after a teacher explicitly
          // chooses the student. Any uncertain bubbles still create review
          // items through the normal flow below.
          result.review_required = false;
          result.error_code = null;
          result.message = null;
        }
        const replacingSelectedManualSheet = Boolean(
          selectedManualSheet && selectedManualSheet.status !== "generated",
        );
        if (canReplaceConfirmed || replacingSelectedManualSheet) {
          const now = new Date().toISOString();
          const { error: historyError } = await supabase.from("result_change_history").insert({
            organization_id: organizationId,
            answer_sheet_id: sheet.id,
            changed_by: userId,
            change_type: selectedManualSheet ? "manual_identification" : "duplicate_resolution",
            previous_value: { status: sheet.status, result_status: sheet.result_status, score: sheet.score },
            new_value: { status: "processing", result_status: "processing", reason: selectedManualSheet ? "manual_student_selection" : "new_card_received" },
            justification: selectedManualSheet
              ? "Professor identificou manualmente o aluno neste cartão; o resultado anterior foi substituído."
              : "Novo cartão recebido para o mesmo aluno e avaliação; o resultado anterior foi substituído.",
          });
          if (historyError) throw new Error(historyError.message);
          const { error: resetError } = await supabase.from("answer_sheets").update({
            status: "processing",
            result_status: "processing",
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
            deleted_at: null,
            updated_at: now,
          }).eq("id", sheet.id);
          if (resetError) throw new Error(resetError.message);
          await supabase.from("detected_answers").delete().eq("answer_sheet_id", sheet.id);
          await supabase.from("review_items").update({ status: "dismissed", resolved_at: now, resolved_by: userId }).eq("answer_sheet_id", sheet.id).neq("status", "dismissed");
        }
        const { data: questions, error: questionsError } = await supabase
          .from("exam_questions")
          .select("question_number,correct_answer,score_value,is_cancelled")
          .eq("exam_version_id", sheet.exam_version_id);
        if (questionsError) {
          throw new CorrectionServiceError(
            "QUESTION_DATABASE_ERROR",
            "Não foi possível consultar o gabarito desta avaliação.",
            503,
          );
        }
        const questionMap = new Map((questions || []).map((question) => [question.question_number, question]));
        let correct = 0;
        let incorrect = 0;
        let blank = 0;
        let invalidated = 0;
        let score = 0;
        const detectedRows = (result.answers || []).map(
          (answer: {
            question_number: number;
            detected_answer: string | null;
            classification: string;
            confidence: number;
            fill_percentages: Record<string, number>;
            crop: [number, number, number, number];
          }) => {
            const question = questionMap.get(answer.question_number);
            let answerResult = "uncertain";
            if (question?.is_cancelled) {
              answerResult = "cancelled";
              invalidated += 1;
              score += Number(question.score_value);
            } else if (answer.classification === "blank") {
              answerResult = "blank";
              blank += 1;
            } else if (answer.classification === "multiple") {
              answerResult = "multiple";
            } else if (
              (answer.classification === "answered" ||
                (allowAmbiguousResults && answer.classification === "low_confidence")) &&
              answer.detected_answer === question?.correct_answer
            ) {
              answerResult = "correct";
              correct += 1;
              score += Number(question?.score_value || 0);
            } else if (
              answer.classification === "answered" ||
              (allowAmbiguousResults && answer.classification === "low_confidence")
            ) {
              answerResult = "incorrect";
              incorrect += 1;
            }
            return {
              answer_sheet_id: sheet.id,
              question_number: answer.question_number,
              detected_answer: answer.detected_answer,
              correct_answer: question?.correct_answer || null,
              confidence: answer.confidence,
              fill_percentages: answer.fill_percentages,
              result: answerResult,
              classification: answer.classification,
              classification_reason: answer.classification,
              crop_coordinates: answer.crop,
            };
          },
        );
        if (detectedRows.length) {
          const { error: answersError } = await supabase
            .from("detected_answers")
            .upsert(detectedRows, { onConflict: "answer_sheet_id,question_number" });
          if (answersError) throw new Error(answersError.message);
        }
        const hasAmbiguousAnswers =
          (!selectedManualSheet && result.review_required) ||
          detectedRows.some((answer: { classification: string }) =>
            ["multiple", "low_confidence", "unreadable"].includes(answer.classification),
          );
        const needsReview = allowAmbiguousResults
          ? !result.secure_token || detectedRows.some((answer: { classification: string }) => answer.classification === "unreadable")
          : hasAmbiguousAnswers;
        const { error: sheetUpdateError } = await supabase
          .from("answer_sheets")
          .update({
            status: needsReview ? "review_required" : "corrected",
            result_status: needsReview ? "review_required" : "corrected",
            purged_at: null,
            score,
            correct_answers: correct,
            incorrect_answers: incorrect,
            blank_answers: blank,
            invalidated_answers: invalidated,
            review_required: needsReview,
            processed_at: new Date().toISOString(),
            layout_version: result.layout_version,
            algorithm_version: result.algorithm_version,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", sheet.id);
        if (sheetUpdateError) {
          throw new CorrectionServiceError(
            "RESULT_DATABASE_ERROR",
            "O processamento terminou, mas o resultado não pôde ser salvo.",
            503,
          );
        }
        const pending = detectedRows
          .filter((answer: { classification: string }) =>
            ["multiple", "low_confidence", "unreadable"].includes(answer.classification),
          )
          .map((answer: { question_number: number; classification: string; confidence: number; crop_coordinates: unknown }) => ({
            organization_id: organizationId,
            batch_id: batch.id,
            processing_file_id: file.id,
            answer_sheet_id: sheet.id,
            student_id: sheet.student_id,
            exam_id: batch.exam_id,
            question_number: answer.question_number,
            issue_type: answer.classification,
            reason: answer.classification,
            confidence: answer.confidence,
            crop_coordinates: answer.crop_coordinates,
          }));
        if (pending.length) {
          const { error: reviewError } = await supabase.from("review_items").insert(pending);
          if (reviewError) {
            throw new CorrectionServiceError(
              "RESULT_DATABASE_ERROR",
              "O resultado foi salvo, mas a revisão não pôde ser preparada.",
              503,
            );
          }
        }
      }
    }
    if (result.error_code && !result.message) {
      result.message = correctionErrorMessages[result.error_code] || null;
    }
    if (!answerSheetId) {
      const { error: reviewError } = await supabase.from("review_items").insert({
        organization_id: organizationId,
        batch_id: batch.id,
        processing_file_id: file.id,
        exam_id: batch.exam_id,
        issue_type: result.error_code || "qr_not_detected",
        reason: result.error_code || "qr_not_detected",
        confidence: 0,
      });
      if (reviewError) {
        throw new CorrectionServiceError(
          "RESULT_DATABASE_ERROR",
          "Não foi possível encaminhar este cartão para revisão.",
          503,
        );
      }
    }
    const fileStatus =
      result.status === "resubmission_required"
        ? "failed"
        : result.review_required
          ? "review_required"
          : "completed";
    const { error: fileUpdateError } = await supabase
      .from("processing_files")
      .update({
        status: fileStatus,
        processed_at: new Date().toISOString(),
        algorithm_version: result.algorithm_version || null,
        qr_status: result.qr_read?.status || null,
        qr_strategy: result.qr_read?.strategy || null,
        error_code: result.error_code || null,
        error_message: result.message || null,
        answer_sheet_id: answerSheetId,
        confidence: result.answers?.length
          ? result.answers.reduce((sum: number, answer: { confidence: number }) => sum + answer.confidence, 0) /
            result.answers.length
          : null,
      })
      .eq("id", file.id);
    if (fileUpdateError) {
      throw new CorrectionServiceError(
        "RESULT_DATABASE_ERROR",
        "O resultado foi calculado, mas o lote não pôde ser atualizado.",
        503,
      );
    }
    return NextResponse.json({
      ...result,
      processing_file_id: file.id,
      attempt_count: claim.new_attempt_count,
    });
  } catch (error) {
    const serviceError =
      error instanceof CorrectionServiceError
        ? error
        : new CorrectionServiceError(
            "PROCESSING_ERROR",
            "Não foi possível concluir o processamento. Tente novamente.",
            502,
          );
    console.error("Correction dispatch failed", {
      processingFileId: file.id,
      code: serviceError.code,
    });
    await supabase
      .from("processing_files")
      .update({
        status: "failed",
        processed_at: new Date().toISOString(),
        error_code: serviceError.code,
        error_message: serviceError.message,
      })
      .eq("id", file.id);
    return NextResponse.json(
      { error: serviceError.message, code: serviceError.code },
      { status: serviceError.httpStatus },
    );
  }
}
