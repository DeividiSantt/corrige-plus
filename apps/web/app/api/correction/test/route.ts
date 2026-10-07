import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ANSWER_SHEET_BUCKET } from "@/features/correction/config";
import { callCorrectionService, CorrectionServiceError, getCorrectionServiceConfig, verifyCorrectionService } from "@/features/correction/service-config.server";
import { workspaceData } from "@/features/workspace/data";

const examIdSchema = z.string().uuid();
const allowedTypes = new Set(["image/jpeg", "image/png"]);
const maxFileSize = 12 * 1024 * 1024;

/** Runs the production reader without creating a batch or changing official results. */
export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const examId = examIdSchema.safeParse(formData?.get("examId"));
  const image = formData?.get("image");
  if (!examId.success || !(image instanceof File)) return NextResponse.json({ error: "Selecione uma avaliação e uma imagem válida." }, { status: 400 });
  if (!allowedTypes.has(image.type) || image.size === 0 || image.size > maxFileSize) return NextResponse.json({ error: "Envie uma imagem JPG ou PNG de até 12 MB." }, { status: 400 });

  let workspace;
  try { workspace = await workspaceData(); } catch { return NextResponse.json({ error: "Sessão expirada." }, { status: 401 }); }
  const { supabase, userId, organizationId } = workspace;
  const { data: exam } = await supabase.from("exams").select("id,total_questions,alternatives_count").eq("id", examId.data).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (!exam) return NextResponse.json({ error: "Avaliação não encontrada." }, { status: 404 });
  const { data: version } = await supabase.from("exam_versions").select("id").eq("exam_id", exam.id).eq("code", "A").maybeSingle();
  if (!version) return NextResponse.json({ error: "Gabarito da versão A não encontrado." }, { status: 409 });
  const [{ data: questions, error: questionsError }, { data: subjectBlocks }] = await Promise.all([
    supabase.from("exam_questions").select("question_number,correct_answer,is_cancelled").eq("exam_version_id", version.id).order("question_number"),
    supabase.from("exam_subject_blocks").select("subject,start_question_number,end_question_number,position").eq("exam_version_id", version.id).order("position"),
  ]);
  if (questionsError) return NextResponse.json({ error: "Não foi possível consultar o gabarito." }, { status: 503 });

  const extension = image.name.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const storageKey = `${organizationId}/${userId}/testes/${randomUUID()}.${extension}`;
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage.from(ANSWER_SHEET_BUCKET).upload(storageKey, Buffer.from(await image.arrayBuffer()), { contentType: image.type, upsert: false });
    if (uploadError) throw new CorrectionServiceError("TEST_UPLOAD_FAILED", "Não foi possível enviar a foto temporária.", 503);
    uploaded = true;
    const { data: signed, error: signedError } = await supabase.storage.from(ANSWER_SHEET_BUCKET).createSignedUrl(storageKey, 120);
    if (signedError || !signed?.signedUrl) throw new CorrectionServiceError("TEST_UPLOAD_UNAVAILABLE", "Não foi possível preparar a imagem para leitura.", 503);
    const service = getCorrectionServiceConfig();
    await verifyCorrectionService(service.url);
    const result = await callCorrectionService({ url: service.url, apiKey: service.apiKey, body: {
      processing_file_id: randomUUID(), batch_id: randomUUID(), exam_id: exam.id, owner_id: userId, storage_key: storageKey, signed_url: signed.signedUrl,
      layout_version: subjectBlocks?.length ? "corrige-plus-v2-subject-blocks" : "corrige-plus-v1", layout_profile_id: subjectBlocks?.length ? "corrige-plus-v2-subject-blocks" : "corrige-plus-v1", total_questions: exam.total_questions, alternatives_count: exam.alternatives_count, subject_blocks: subjectBlocks || [],
    } });
    const readByQuestion = new Map((result.answers || []).map((answer: { question_number: number }) => [answer.question_number, answer]));
    const answers = (questions || []).map((question) => {
      const read = readByQuestion.get(question.question_number) as { detected_answer: string | null; classification: string; confidence: number } | undefined;
      let resultStatus: "correct" | "incorrect" | "blank" | "review" = "blank";
      if (question.is_cancelled) resultStatus = "review";
      else if (read?.classification === "answered" || read?.classification === "low_confidence") resultStatus = read.detected_answer === question.correct_answer ? "correct" : "incorrect";
      else if (read && read.classification !== "blank") resultStatus = "review";
      return { questionNumber: question.question_number, detectedAnswer: read?.detected_answer || null, correctAnswer: question.correct_answer, classification: read?.classification || "blank", confidence: read?.confidence || 0, result: resultStatus };
    });
    const summary = answers.reduce((total, answer) => ({ ...total, [answer.result]: total[answer.result] + 1 }), { correct: 0, incorrect: 0, blank: 0, review: 0 });
    return NextResponse.json({ fileName: image.name, summary, answers });
  } catch (error) {
    const serviceError = error instanceof CorrectionServiceError ? error : new CorrectionServiceError("TEST_PROCESSING_ERROR", "Não foi possível analisar esta foto de teste.", 502);
    return NextResponse.json({ error: serviceError.message, code: serviceError.code }, { status: serviceError.httpStatus });
  } finally {
    if (uploaded) await supabase.storage.from(ANSWER_SHEET_BUCKET).remove([storageKey]);
  }
}
