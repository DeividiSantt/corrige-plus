import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps", "web", "package.json"));
const { createClient } = require("@supabase/supabase-js");

function readEnv(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([^#=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^"|"$/g, "")]),
  );
}

const env = readEnv(path.join(root, "apps", "web", ".env.local"));
const serviceEnv = readEnv(path.join(root, "services", "correction-api", ".env"));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const apiUrl = (env.CORRECTION_API_URL || env.NEXT_PUBLIC_CORRECTION_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const apiKey = env.CORRECTION_API_KEY || serviceEnv.CORRECTION_API_KEY;

if (!apiKey) throw new Error("A chave interna da API de correção não foi configurada.");

const healthResponse = await fetch(`${apiUrl}/health`);
if (!healthResponse.ok) throw new Error("A API de correção não está disponível.");
const health = await healthResponse.json();
const now = () => new Date().toISOString();
const expiration = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const allowAmbiguousResults = env.CORRECTION_ALLOW_AMBIGUOUS_RESULTS === "true";

const requestedLimit = Number.parseInt(process.env.REPROCESS_LIMIT || "1", 10);
const imageToIngest = process.env.INGEST_IMAGE;
const ingestedFileName = process.env.INGEST_FILE_NAME;
const { data: files, error: filesError } = await supabase
  .from("processing_files")
  .select("id,batch_id,file_name,storage_key,status")
  .eq("status", "failed")
  .in("error_code", ["CORRECTION_SERVICE_TIMEOUT", "CORRECTION_SERVICE_UNAVAILABLE"])
  .like("file_name", "IMG_%")
  .order("created_at");
if (filesError) throw filesError;

let candidates = (files || []).slice(0, Number.isFinite(requestedLimit) ? requestedLimit : 1);
if (imageToIngest) {
  const imagePath = path.resolve(imageToIngest);
  if (!fs.existsSync(imagePath)) throw new Error("A foto adicional não foi encontrada.");
  const { data: latest } = await supabase
    .from("processing_files")
    .select("batch_id")
    .like("file_name", "IMG_%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) throw new Error("Não foi possível localizar o lote de referência.");
  const { data: sourceBatch, error: sourceBatchError } = await supabase
    .from("processing_batches")
    .select("organization_id,exam_id,class_id,created_by")
    .eq("id", latest.batch_id)
    .single();
  if (sourceBatchError || !sourceBatch) throw new Error("O lote de referência não está disponível.");
  const { data: batch, error: batchError } = await supabase
    .from("processing_batches")
    .insert({ ...sourceBatch, status: "waiting", total_files: 1, queued_files: 1 })
    .select("id")
    .single();
  if (batchError || !batch) throw new Error("Não foi possível criar o lote para a foto adicional.");
  const buffer = fs.readFileSync(imagePath);
  const { data: record, error: recordError } = await supabase
    .from("processing_files")
    .insert({ batch_id: batch.id, file_name: ingestedFileName || path.basename(imagePath), file_hash: createHash("sha256").update(buffer).digest("hex"), status: "waiting" })
    .select("id,batch_id,file_name,storage_key,status")
    .single();
  if (recordError || !record) throw new Error("Não foi possível registrar a foto adicional.");
  const storageKey = `${sourceBatch.organization_id}/${sourceBatch.created_by}/${sourceBatch.exam_id}/${batch.id}/${record.id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("answer-sheet-uploads")
    .upload(storageKey, buffer, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(`Não foi possível enviar a foto adicional: ${uploadError.message}`);
  const { error: storageError } = await supabase.from("processing_files").update({ storage_key: storageKey }).eq("id", record.id);
  if (storageError) throw storageError;
  candidates = [{ ...record, storage_key: storageKey }];
}

const summary = { attempted: 0, completed: 0, reviewRequired: 0, failed: 0, results: [] };

async function finishFailure(file, code, message) {
  await supabase
    .from("processing_files")
    .update({ status: "failed", processed_at: now(), error_code: code, error_message: message })
    .eq("id", file.id);
  summary.failed += 1;
  summary.results.push({ file: file.file_name, status: "failed", code });
}

for (const file of candidates) {
  summary.attempted += 1;
  try {
    const { data: batch, error: batchError } = await supabase
      .from("processing_batches")
      .select("id,organization_id,exam_id,created_by")
      .eq("id", file.batch_id)
      .single();
    if (batchError || !batch || !file.storage_key) throw new Error("Arquivo ou lote não encontrado.");

    const { data: exam, error: examError } = await supabase
      .from("exams")
      .select("total_questions,alternatives_count")
      .eq("id", batch.exam_id)
      .eq("organization_id", batch.organization_id)
      .single();
    if (examError || !exam) throw new Error("Avaliação não encontrada.");

    const { data: version } = await supabase
      .from("exam_versions")
      .select("id")
      .eq("exam_id", batch.exam_id)
      .eq("code", "A")
      .maybeSingle();
    const { data: subjectBlocks } = version
      ? await supabase
          .from("exam_subject_blocks")
          .select("subject,start_question_number,end_question_number,position")
          .eq("exam_version_id", version.id)
          .order("position")
      : { data: [] };

    const { data: signed, error: signedError } = await supabase.storage
      .from("answer-sheet-uploads")
      .createSignedUrl(file.storage_key, 300);
    if (signedError || !signed?.signedUrl) throw new Error("A imagem temporária não está disponível.");

    const { data: claims, error: claimError } = await supabase.rpc("claim_processing_file", {
      p_processing_file_id: file.id,
      p_retry: file.status === "failed",
      p_algorithm_version: health.pipeline_version,
    });
    if (claimError || claims?.[0]?.claim_status !== "claimed") {
      throw new Error(claimError?.message || "O cartão não pôde ser reservado para reprocessamento.");
    }
    await supabase
      .from("review_items")
      .update({ status: "dismissed", resolved_at: now(), resolved_by: batch.created_by })
      .eq("processing_file_id", file.id)
      .eq("status", "pending");

    const response = await fetch(`${apiUrl}/v1/process-sheet`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        processing_file_id: file.id,
        batch_id: batch.id,
        exam_id: batch.exam_id,
        owner_id: batch.created_by,
        storage_key: file.storage_key,
        signed_url: signed.signedUrl,
        layout_version: subjectBlocks?.length ? "corrige-plus-v2-subject-blocks" : "corrige-plus-v1",
        total_questions: exam.total_questions,
        alternatives_count: exam.alternatives_count,
        subject_blocks: subjectBlocks || [],
      }),
    });
    if (!response.ok) throw new Error(`A API devolveu ${response.status}.`);
    const result = await response.json();
    let answerSheetId = null;

    if (result.secure_token) {
      const { data: sheet, error: sheetError } = await supabase
        .from("answer_sheets")
        .select("id,exam_id,exam_version_id,student_id,status,manually_changed,purged_at,score,result_status")
        .eq("secure_token", result.secure_token)
        .eq("organization_id", batch.organization_id)
        .is("deleted_at", null)
        .maybeSingle();
      const duplicate = sheet && !sheet.purged_at && (sheet.manually_changed || ["corrected", "review_required", "confirmed"].includes(sheet.status));
      if (sheetError || !sheet || sheet.exam_id !== batch.exam_id || duplicate) {
        result.review_required = true;
        result.error_code ||= sheetError ? "QR_DATABASE_ERROR" : !sheet ? "INVALID_QR_TOKEN" : sheet.exam_id !== batch.exam_id ? "WRONG_EXAM" : "DUPLICATE_SHEET";
      } else {
        answerSheetId = sheet.id;
        const { data: questions, error: questionsError } = await supabase
          .from("exam_questions")
          .select("question_number,correct_answer,score_value,is_cancelled")
          .eq("exam_version_id", sheet.exam_version_id);
        if (questionsError) throw questionsError;
        const questionMap = new Map((questions || []).map((question) => [question.question_number, question]));
        let correct = 0, incorrect = 0, blank = 0, invalidated = 0, score = 0;
        const detectedRows = (result.answers || []).map((answer) => {
          const question = questionMap.get(answer.question_number);
          let answerResult = "uncertain";
          if (question?.is_cancelled) { answerResult = "cancelled"; invalidated += 1; score += Number(question.score_value); }
          else if (answer.classification === "blank") { answerResult = "blank"; blank += 1; }
          else if (answer.classification === "multiple") answerResult = "multiple";
          else if ((answer.classification === "answered" || (allowAmbiguousResults && answer.classification === "low_confidence")) && answer.detected_answer === question?.correct_answer) {
            answerResult = "correct"; correct += 1; score += Number(question?.score_value || 0);
          } else if (answer.classification === "answered" || (allowAmbiguousResults && answer.classification === "low_confidence")) { answerResult = "incorrect"; incorrect += 1; }
          return { answer_sheet_id: sheet.id, question_number: answer.question_number, detected_answer: answer.detected_answer, correct_answer: question?.correct_answer || null, confidence: answer.confidence, fill_percentages: answer.fill_percentages, result: answerResult, classification: answer.classification, classification_reason: answer.classification, crop_coordinates: answer.crop };
        });
        if (detectedRows.length) {
          const { error } = await supabase.from("detected_answers").upsert(detectedRows, { onConflict: "answer_sheet_id,question_number" });
          if (error) throw error;
        }
        const needsReview = allowAmbiguousResults ? !result.secure_token || detectedRows.some((answer) => answer.classification === "unreadable") : result.review_required || detectedRows.some((answer) => ["multiple", "low_confidence", "unreadable"].includes(answer.classification));
        const { error: updateSheetError } = await supabase
          .from("answer_sheets")
          .update({ status: needsReview ? "review_required" : "corrected", result_status: needsReview ? "review_required" : "corrected", purged_at: null, score, correct_answers: correct, incorrect_answers: incorrect, blank_answers: blank, invalidated_answers: invalidated, review_required: needsReview, processed_at: now(), layout_version: result.layout_version, algorithm_version: result.algorithm_version, expires_at: expiration() })
          .eq("id", sheet.id);
        if (updateSheetError) throw updateSheetError;
        const pending = detectedRows.filter((answer) => ["multiple", "low_confidence", "unreadable"].includes(answer.classification)).map((answer) => ({ organization_id: batch.organization_id, batch_id: batch.id, processing_file_id: file.id, answer_sheet_id: sheet.id, student_id: sheet.student_id, exam_id: batch.exam_id, question_number: answer.question_number, issue_type: answer.classification, reason: answer.classification, confidence: answer.confidence, crop_coordinates: answer.crop_coordinates }));
        if (pending.length) {
          const { error } = await supabase.from("review_items").insert(pending);
          if (error) throw error;
        }
      }
    }

    if (!answerSheetId) {
      const { error } = await supabase.from("review_items").insert({ organization_id: batch.organization_id, batch_id: batch.id, processing_file_id: file.id, exam_id: batch.exam_id, issue_type: result.error_code || "qr_not_detected", reason: result.error_code || "qr_not_detected", confidence: 0 });
      if (error) throw error;
    }
    const fileStatus = result.status === "resubmission_required" ? "failed" : result.review_required ? "review_required" : "completed";
    const { error: updateFileError } = await supabase
      .from("processing_files")
      .update({ status: fileStatus, processed_at: now(), algorithm_version: result.algorithm_version || null, qr_status: result.qr_read?.status || null, qr_strategy: result.qr_read?.strategy || null, error_code: result.error_code || null, error_message: result.message || null, answer_sheet_id: answerSheetId, confidence: result.answers?.length ? result.answers.reduce((sum, answer) => sum + answer.confidence, 0) / result.answers.length : null })
      .eq("id", file.id);
    if (updateFileError) throw updateFileError;
    if (fileStatus === "completed") summary.completed += 1;
    else if (fileStatus === "review_required") summary.reviewRequired += 1;
    else summary.failed += 1;
    summary.results.push({ file: file.file_name, status: fileStatus, answers: result.answers?.length || 0, code: result.error_code || null });
  } catch (error) {
    await finishFailure(file, "PROCESSING_ERROR", error instanceof Error ? error.message : "Falha desconhecida.");
  }
}

console.log(JSON.stringify(summary, null, 2));
