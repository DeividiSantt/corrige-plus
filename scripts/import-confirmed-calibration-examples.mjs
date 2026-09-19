import { readFile } from "node:fs/promises";

const environment = Object.fromEntries(
  (await readFile(new URL("../apps/web/.env.local", import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const url = environment.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = environment.SUPABASE_SERVICE_ROLE_KEY;
const rawConfirmations = process.env.CALIBRATION_CONFIRMATIONS_JSON;
if (!url || !serviceKey || !rawConfirmations) {
  throw new Error("Configure CALIBRATION_CONFIRMATIONS_JSON e as credenciais locais antes de executar.");
}

const confirmations = JSON.parse(rawConfirmations);
if (!Array.isArray(confirmations) || confirmations.length === 0) {
  throw new Error("Nenhuma confirmação válida foi informada.");
}

function normalizeName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}

async function request(path, options = {}) {
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`Falha no banco: ${response.status}`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

function inFilter(values) {
  return `in.(${values.join(",")})`;
}

const pendingItems = await request("/review_items?select=id,organization_id,answer_sheet_id,processing_file_id,question_number&status=eq.pending");
const sheetIds = [...new Set(pendingItems.filter((item) => item.answer_sheet_id).map((item) => item.answer_sheet_id))];
const sheets = sheetIds.length
  ? await request(`/answer_sheets?select=id,student_id,exam_version_id,layout_version,algorithm_version&id=${inFilter(sheetIds)}`)
  : [];
const studentIds = [...new Set(sheets.map((sheet) => sheet.student_id))];
const students = studentIds.length
  ? await request(`/students?select=id,full_name&id=${inFilter(studentIds)}`)
  : [];
const answers = sheetIds.length
  ? await request(`/detected_answers?select=id,answer_sheet_id,question_number,detected_answer,correct_answer,classification,confidence,fill_percentages,crop_coordinates,result&id=not.is.null&answer_sheet_id=${inFilter(sheetIds)}`)
  : [];
const versionIds = [...new Set(sheets.map((sheet) => sheet.exam_version_id))];
const questions = versionIds.length
  ? await request(`/exam_questions?select=exam_version_id,question_number,score_value&exam_version_id=${inFilter(versionIds)}`)
  : [];

const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));
const studentById = new Map(students.map((student) => [student.id, student]));
const answersBySheet = new Map();
for (const answer of answers) {
  const list = answersBySheet.get(answer.answer_sheet_id) || [];
  list.push(answer);
  answersBySheet.set(answer.answer_sheet_id, list);
}
const questionValue = new Map(questions.map((question) => [`${question.exam_version_id}:${question.question_number}`, Number(question.score_value)]));
const affectedSheets = new Set();

for (const confirmation of confirmations) {
  const expectedName = normalizeName(String(confirmation.studentName || ""));
  const expectedQuestion = Number(confirmation.questionNumber);
  const choices = [...new Set((confirmation.answers || []).map((answer) => String(answer).trim().toUpperCase()))].sort();
  if (!expectedName || !Number.isInteger(expectedQuestion) || choices.some((answer) => !/^[A-E]$/.test(answer)) || choices.length > 5) {
    throw new Error("Uma confirmação informada é inválida.");
  }
  const matchingItems = pendingItems.filter((item) => {
    const sheet = sheetById.get(item.answer_sheet_id);
    const student = sheet && studentById.get(sheet.student_id);
    return item.question_number === expectedQuestion && normalizeName(student?.full_name || "") === expectedName;
  });
  if (matchingItems.length !== 1) throw new Error("Não foi possível associar uma confirmação a uma única revisão pendente.");
  const item = matchingItems[0];
  const sheet = sheetById.get(item.answer_sheet_id);
  const answer = (answersBySheet.get(item.answer_sheet_id) || []).find((entry) => entry.question_number === expectedQuestion);
  if (!sheet || !answer) throw new Error("A resposta técnica da revisão não foi localizada.");

  const confirmedKind = choices.length === 0 ? "blank" : choices.length === 1 ? "answer" : "multiple";
  const originalDetectedAnswer = answer.detected_answer;
  const result = confirmedKind === "blank"
    ? "blank"
    : confirmedKind === "multiple"
      ? "multiple"
      : choices[0] === answer.correct_answer ? "correct" : "incorrect";

  await request(`/detected_answers?id=eq.${answer.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      detected_answer: confirmedKind === "answer" ? choices[0] : null,
      result,
      manually_reviewed: true,
      reviewed_at: new Date().toISOString(),
    }),
  });
  answer.detected_answer = confirmedKind === "answer" ? choices[0] : null;
  answer.result = result;

  await request("/calibration_examples", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      organization_id: item.organization_id,
      review_item_id: item.id,
      answer_sheet_id: item.answer_sheet_id,
      processing_file_id: item.processing_file_id,
      question_number: expectedQuestion,
      detected_answer: originalDetectedAnswer,
      confirmed_answers: choices,
      confirmed_kind: confirmedKind,
      original_classification: answer.classification,
      original_confidence: answer.confidence,
      fill_percentages: answer.fill_percentages,
      crop_coordinates: answer.crop_coordinates,
      layout_version: sheet.layout_version,
      algorithm_version: sheet.algorithm_version,
      confirmed_by: null,
    }),
  });

  await request(`/review_items?id=eq.${item.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "resolved", resolved_at: new Date().toISOString() }),
  });
  item.status = "resolved";
  affectedSheets.add(sheet.id);
}

for (const sheetId of affectedSheets) {
  const sheet = sheetById.get(sheetId);
  const sheetAnswers = answersBySheet.get(sheetId) || [];
  const unresolved = pendingItems.some((item) => item.answer_sheet_id === sheetId && item.status === "pending");
  const correct = sheetAnswers.filter((answer) => answer.result === "correct").length;
  const incorrect = sheetAnswers.filter((answer) => answer.result === "incorrect").length;
  const blank = sheetAnswers.filter((answer) => answer.result === "blank").length;
  const score = sheetAnswers.reduce((total, answer) => total + (answer.result === "correct" ? questionValue.get(`${sheet.exam_version_id}:${answer.question_number}`) || 0 : 0), 0);
  await request(`/answer_sheets?id=eq.${sheetId}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      score,
      correct_answers: correct,
      incorrect_answers: incorrect,
      blank_answers: blank,
      review_required: unresolved,
      status: unresolved ? "review_required" : "confirmed",
      result_status: unresolved ? "review_required" : "manually_changed",
      manually_changed: true,
      processed_at: new Date().toISOString(),
    }),
  });
}

console.log(`Importação concluída: ${confirmations.length} exemplo(s) confirmados.`);
