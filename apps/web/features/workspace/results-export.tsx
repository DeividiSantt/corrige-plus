"use client";

import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

type SubjectBlock = { subject: string; start_question_number: number; end_question_number: number; position: number };
type ResultRow = {
  id: string; score: number | null; correct_answers: number | null; incorrect_answers: number | null; blank_answers: number | null; processed_at: string | null; status: string;
  students: { full_name: string; registration_number: string | null; call_number: number | null } | null;
  classes: { name: string } | null; exams: { title: string; subject: string | null; exam_date: string | null; total_score: number | null } | null;
  detected_answers: { question_number: number; result: string; correct_answer: string | null }[];
  subject_blocks: SubjectBlock[]; question_scores: { question_number: number; score_value: number | string }[];
};
type ActivityGrade = { name: string; registration: string; callNumber: string; score: number };
type SubjectResult = { subject: string; correct: number; totalQuestions: number; score: number; maxScore: number };

function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function normalize(value: unknown) { return String(value ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }
function numberValue(value: unknown) { const parsed = Number(String(value ?? "").trim().replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; }
function statusLabel(status: string) {
  return ({
    corrected: "Corrigido",
    confirmed: "Confirmado",
    review_required: "Revisão necessária",
    processing: "Processando",
    generated: "Aguardando envio",
    awaiting_upload: "Aguardando envio",
    failed: "Com erro",
    purged: "Removido",
  } as Record<string, string>)[status] || "Pendente";
}

function isFinalized(row: ResultRow) { return ["corrected", "confirmed"].includes(row.status); }

function subjectResults(row: ResultRow): SubjectResult[] {
  if (!isFinalized(row) || !row.subject_blocks.length) return [];
  const scores = new Map(row.question_scores.map((question) => [question.question_number, Number(question.score_value) || 0]));
  return row.subject_blocks.map((block) => {
    const answers = row.detected_answers.filter((answer) => answer.question_number >= block.start_question_number && answer.question_number <= block.end_question_number);
    const totalQuestions = block.end_question_number - block.start_question_number + 1;
    const correct = answers.filter((answer) => answer.result === "correct").length;
    const score = answers.reduce((total, answer) => total + (["correct", "cancelled"].includes(answer.result) ? scores.get(answer.question_number) || 0 : 0), 0);
    const maxScore = Array.from({ length: totalQuestions }, (_, index) => scores.get(block.start_question_number + index) || 0).reduce((total, value) => total + value, 0);
    return { subject: block.subject, correct, totalQuestions, score, maxScore };
  });
}

function parseActivityFile(data: ArrayBuffer, fileName: string): ActivityGrade[] {
  const workbook = XLSX.read(data, { type: "array", cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
  let headerIndex = -1;
  let fields: { name?: number; registration?: number; call?: number; score?: number } = {};
  for (let index = 0; index < Math.min(10, rows.length); index += 1) {
    const candidate: typeof fields = {};
    (rows[index] || []).forEach((value, column) => {
      const header = normalize(value);
      if (header.includes("matricula") || header === "ra") candidate.registration ??= column;
      else if (header.includes("chamada") || header === "numero" || header === "n") candidate.call ??= column;
      else if (header.includes("nota") || header.includes("atividade") || header.includes("score")) candidate.score ??= column;
      else if (header.includes("nome") || header === "aluno") candidate.name ??= column;
    });
    if (candidate.score !== undefined && (candidate.name !== undefined || candidate.registration !== undefined || candidate.call !== undefined)) { headerIndex = index; fields = candidate; break; }
  }
  if (headerIndex < 0 || fields.score === undefined) throw new Error("Não encontrei as colunas de identificação e nota de atividade. Use Nome, Matrícula ou Número da chamada e Nota atividade.");
  const grades: ActivityGrade[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const name = fields.name === undefined ? "" : String(row[fields.name] ?? "").trim();
    const registration = fields.registration === undefined ? "" : String(row[fields.registration] ?? "").trim();
    const callNumber = fields.call === undefined ? "" : String(row[fields.call] ?? "").trim();
    const score = numberValue(row[fields.score]);
    if ((!name && !registration && !callNumber) || score === null) continue;
    if (score < 0 || score > 10) throw new Error(`A nota de atividade deve estar entre 0 e 10. Valor encontrado: ${score}.`);
    grades.push({ name, registration, callNumber, score });
  }
  if (!grades.length) throw new Error(`Nenhuma nota válida foi encontrada em ${fileName}.`);
  return grades;
}

function activityForResult(row: ResultRow, grades: ActivityGrade[]) {
  const registration = normalize(row.students?.registration_number); const callNumber = String(row.students?.call_number ?? ""); const name = normalize(row.students?.full_name);
  return grades.find((grade) => (registration && normalize(grade.registration) === registration) || (callNumber && grade.callNumber === callNumber) || (name && normalize(grade.name) === name)) || null;
}

export function ResultsExport({ results }: { results: ResultRow[] }) {
  const [exam, setExam] = useState("all"); const [weightedExam, setWeightedExam] = useState("all"); const [activityGrades, setActivityGrades] = useState<ActivityGrade[]>([]); const [activityFileName, setActivityFileName] = useState(""); const [activityError, setActivityError] = useState(""); const [activityWeight, setActivityWeight] = useState(5);
  const exams = useMemo(() => [...new Set(results.map((row) => row.exams?.title).filter(Boolean))] as string[], [results]);
  const filtered = useMemo(() => results.filter((row) => exam === "all" || row.exams?.title === exam), [exam, results]);
  const detailedSubjectRows = useMemo(() => filtered.flatMap((row) => subjectResults(row).map((subject) => ({ row, subject }))), [filtered]);
  const availableSubjects = useMemo(() => [...new Set(detailedSubjectRows.map(({ subject }) => subject.subject))], [detailedSubjectRows]);
  const weightedResults = useMemo(() => results.filter((row) => row.exams?.title === weightedExam).map((row) => { const activity = activityForResult(row, activityGrades); const examMax = Math.max(0.01, Number(row.exams?.total_score || 10)); const examOnTen = isFinalized(row) && row.score !== null ? Math.max(0, Math.min(10, (Number(row.score) / examMax) * 10)) : null; return { row, activity, examOnTen, final: activity && examOnTen !== null ? (activity.score / 10) * activityWeight + (examOnTen / 10) * (10 - activityWeight) : null }; }), [activityGrades, activityWeight, results, weightedExam]);

  async function readActivityFile(file: File) { setActivityError(""); setActivityFileName(file.name); try { setActivityGrades(parseActivityFile(await file.arrayBuffer(), file.name)); } catch (error) { setActivityGrades([]); setActivityError(error instanceof Error ? error.message : "Não foi possível ler o Excel de atividades."); } }
  function exportExcel() {
    const rows = filtered.map((row) => ({ Número: row.students?.call_number ?? "", Aluno: row.students?.full_name ?? "Aluno", Matrícula: row.students?.registration_number ?? "", Turma: row.classes?.name ?? "", Avaliação: row.exams?.title ?? "", Disciplina: row.exams?.subject ?? "", Acertos: isFinalized(row) ? row.correct_answers ?? 0 : "", Erros: isFinalized(row) ? row.incorrect_answers ?? 0 : "", "Em branco": isFinalized(row) ? row.blank_answers ?? 0 : "", Anuladas: "", "Nota geral": isFinalized(row) ? row.score ?? "" : "", ...Object.fromEntries(subjectResults(row).flatMap((subject) => [[`${subject.subject} — acertos`, `${subject.correct}/${subject.totalQuestions}`], [`${subject.subject} — nota`, subject.score]])), Status: row.status, "Data da correção": row.processed_at ? new Date(row.processed_at) : "" }));
    const map = new Map<number, { answer: string; correct: number; incorrect: number; blank: number }>();
    filtered.filter(isFinalized).forEach((row) => row.detected_answers.forEach((answer) => { const value = map.get(answer.question_number) || { answer: answer.correct_answer || "", correct: 0, incorrect: 0, blank: 0 }; if (answer.result === "correct") value.correct += 1; else if (answer.result === "blank") value.blank += 1; else if (["incorrect", "multiple"].includes(answer.result)) value.incorrect += 1; map.set(answer.question_number, value); }));
    const questionRows = [...map.entries()].sort(([a], [b]) => a - b).map(([number, value]) => ({ "Número da questão": number, "Alternativa correta": value.answer, "Quantidade de acertos": value.correct, "Quantidade de erros": value.incorrect, "Quantidade em branco": value.blank, "Percentual de acerto": value.correct / Math.max(1, value.correct + value.incorrect + value.blank) }));
    const subjectRows = detailedSubjectRows.map(({ row, subject }) => ({ Número: row.students?.call_number ?? "", Aluno: row.students?.full_name ?? "Aluno", Turma: row.classes?.name ?? "", Avaliação: row.exams?.title ?? "", Matéria: subject.subject, Acertos: subject.correct, "Total de questões": subject.totalQuestions, Nota: subject.score, "Valor máximo": subject.maxScore }));
    const finalRows = filtered.filter(isFinalized); const scores = finalRows.flatMap((row) => row.score === null ? [] : [Number(row.score)]); const total = questionRows.reduce((sum, row) => sum + row["Quantidade de acertos"] + row["Quantidade de erros"] + row["Quantidade em branco"], 0);
    const summary = [{ "Quantidade de alunos": filtered.length, "Quantidade de cartões corrigidos": finalRows.length, "Quantidade em revisão": filtered.filter((row) => row.status === "review_required").length, "Média da turma": scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : "", "Maior nota": scores.length ? Math.max(...scores) : "", "Menor nota": scores.length ? Math.min(...scores) : "", "Percentual médio de acertos": total ? questionRows.reduce((sum, row) => sum + row["Quantidade de acertos"], 0) / total : "" }];
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Resultados"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subjectRows), "Notas por matéria"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(questionRows), "Desempenho por questão"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), "Resumo");
    downloadBlob(new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "resultados-corrige-plus.xlsx");
  }
  function exportSubjectExcel(subjectName: string) {
    const rows = detailedSubjectRows
      .filter(({ subject }) => subject.subject === subjectName)
      .map(({ row, subject }) => ({
        Número: row.students?.call_number ?? "",
        Aluno: row.students?.full_name ?? "Aluno",
        Matrícula: row.students?.registration_number ?? "",
        Turma: row.classes?.name ?? "",
        Avaliação: row.exams?.title ?? "",
        Matéria: subject.subject,
        Acertos: subject.correct,
        "Total de questões": subject.totalQuestions,
        "Nota original": Number(subject.score.toFixed(2)),
        "Valor máximo original": Number(subject.maxScore.toFixed(2)),
        "Nota da matéria (0-10)": Number((subject.maxScore > 0 ? (subject.score / subject.maxScore) * 10 : 0).toFixed(2)),
        Status: row.status,
        "Data da correção": row.processed_at ? new Date(row.processed_at) : "",
      }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Notas");
    const fileName = subjectName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "materia";
    downloadBlob(
      new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `notas-${fileName}-0-a-10.xlsx`,
    );
  }
  function exportWeightedExcel() { const rows = weightedResults.map(({ row, activity, examOnTen, final }) => ({ Número: row.students?.call_number ?? "", Aluno: row.students?.full_name ?? "Aluno", Matrícula: row.students?.registration_number ?? "", Turma: row.classes?.name ?? "", Avaliação: row.exams?.title ?? "", "Nota de atividade (0-10)": activity?.score ?? "", "Nota da prova (0-10)": examOnTen === null ? "Em revisão" : Number(examOnTen.toFixed(2)), "Peso atividade": activityWeight, "Peso prova": 10 - activityWeight, "Nota final": final === null ? "Sem nota final" : Number(final.toFixed(2)) })); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Notas finais"); downloadBlob(new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "notas-finais-ponderadas.xlsx"); }
  function exportPdf() {
    const pdf = new jsPDF({ unit: "mm", format: "a4" }); pdf.setFontSize(18); pdf.text("CORRIGE+ - Relatório de resultados", 14, 18); pdf.setFontSize(10); pdf.text(filtered[0]?.exams?.title || "Todas as avaliações", 14, 26); pdf.setTextColor(90); pdf.text("Notas e estatísticas aparecem somente após a confirmação.", 14, 31); pdf.setTextColor(0); let y = 42; const headers = ["Nº", "Aluno", "Turma", "Acert.", "Erros", "Brancos", "Nota", "Status"]; const x = [10, 21, 70, 108, 126, 143, 162, 178]; const writeHeaders = () => { pdf.setFont("helvetica", "bold"); headers.forEach((header, index) => pdf.text(header, x[index], y)); pdf.setFont("helvetica", "normal"); }; writeHeaders(); y += 7;
    filtered.forEach((row) => { if (y > 280) { pdf.addPage(); y = 18; writeHeaders(); y += 7; } const finalized = isFinalized(row); [String(row.students?.call_number ?? "-"), (row.students?.full_name || "Aluno").slice(0, 24), (row.classes?.name || "-").slice(0, 14), finalized ? String(row.correct_answers ?? 0) : "—", finalized ? String(row.incorrect_answers ?? 0) : "—", finalized ? String(row.blank_answers ?? 0) : "—", !finalized || row.score === null ? "—" : Number(row.score).toFixed(2), statusLabel(row.status).slice(0, 18)].forEach((value, index) => pdf.text(value, x[index], y)); y += 6; });
    if (detailedSubjectRows.length) { pdf.addPage(); pdf.setFontSize(16); pdf.text("Notas por matéria", 14, 18); pdf.setFontSize(9); const detailHeaders = ["Aluno", "Matéria", "Acertos", "Nota"]; const detailX = [14, 74, 137, 165]; y = 28; pdf.setFont("helvetica", "bold"); detailHeaders.forEach((header, index) => pdf.text(header, detailX[index], y)); pdf.setFont("helvetica", "normal"); y += 7; detailedSubjectRows.forEach(({ row, subject }) => { if (y > 280) { pdf.addPage(); y = 18; detailHeaders.forEach((header, index) => pdf.text(header, detailX[index], y)); y += 7; } pdf.text((row.students?.full_name || "Aluno").slice(0, 27), detailX[0], y); pdf.text(subject.subject.slice(0, 26), detailX[1], y); pdf.text(`${subject.correct}/${subject.totalQuestions}`, detailX[2], y); pdf.text(`${subject.score.toFixed(2)} / ${subject.maxScore.toFixed(2)}`, detailX[3], y); y += 6; }); }
    pdf.save("relatorio-resultados-corrige-plus.pdf");
  }

  const matchedCount = weightedResults.filter((item) => item.activity).length;
  return <section className="space-y-6 rounded-xl border border-border bg-background p-5 sm:p-6"><div><h2 className="text-lg font-bold">Exportar resultados</h2><p className="mt-1 text-sm text-muted-foreground">Notas e estatísticas só são incluídas depois da confirmação da correção. Cartões em revisão aparecem sem nota final.</p></div><label className="block max-w-md text-sm font-semibold">Avaliação<select value={exam} onChange={(event) => setExam(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"><option value="all">Todas as avaliações</option>{exams.map((title) => <option key={title} value={title}>{title}</option>)}</select></label>{detailedSubjectRows.length > 0 && <section className="overflow-hidden rounded-lg border border-border" aria-labelledby="subject-results-title"><div className="border-b border-border bg-surface px-4 py-3"><h3 id="subject-results-title" className="font-bold">Notas por matéria</h3><p className="mt-1 text-sm text-muted-foreground">Cada resultado mostra a nota obtida em cada bloco da prova.</p></div><div className="divide-y divide-border">{filtered.map((row) => { const subjects = subjectResults(row); if (!subjects.length) return null; return <div key={row.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{row.students?.full_name || "Aluno"}</p><p className="text-sm text-muted-foreground">{row.exams?.title || "Avaliação"} · Nota geral: {row.score === null ? "Em revisão" : Number(row.score).toFixed(2)}</p></div><div className="flex flex-wrap gap-2">{subjects.map((subject) => <span key={subject.subject} className="rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">{subject.subject}: {subject.score.toFixed(2)}/{subject.maxScore.toFixed(2)} · {subject.correct}/{subject.totalQuestions}</span>)}</div></div>; })}</div></section>}{availableSubjects.length > 0 && <section className="rounded-lg border border-border bg-surface p-4"><h3 className="font-bold">Excel individual por matéria</h3><p className="mt-1 text-sm text-muted-foreground">Cada arquivo traz a nota daquela matéria convertida para a escala de 0 a 10.</p><div className="mt-3 flex flex-wrap gap-2">{availableSubjects.map((subject) => <button key={subject} type="button" onClick={() => exportSubjectExcel(subject)} className="min-h-11 rounded-lg border border-primary bg-background px-4 text-sm font-semibold text-primary hover:bg-primary-soft">Baixar {subject} (0–10)</button>)}</div></section>}<div className="flex flex-wrap gap-3"><button type="button" onClick={exportExcel} disabled={!filtered.length} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Baixar Excel geral (.xlsx)</button><button type="button" onClick={exportPdf} disabled={!filtered.length} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50">Baixar PDF</button></div>{!filtered.length && <p className="text-sm text-muted-foreground">Ainda não há resultados corrigidos para exportar.</p>}<div className="border-t border-border pt-6"><h3 className="font-bold">Compor nota de atividade + prova</h3><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Envie um Excel com as notas de atividade em escala de 0 a 10. A nota da prova também será normalizada para 0 a 10 antes da composição.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Avaliação<select value={weightedExam} onChange={(event) => setWeightedExam(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"><option value="all">Selecione uma avaliação</option>{exams.map((title) => <option key={title} value={title}>{title}</option>)}</select></label><label className="text-sm font-semibold">Excel de atividades<input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && void readActivityFile(event.target.files[0])} className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 font-normal"/><span className="mt-1 block text-xs font-normal text-muted-foreground">Colunas: Nome, Matrícula ou Número da chamada e Nota atividade.</span></label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Peso da atividade (de 10)<input type="number" min="0" max="10" step="0.5" value={activityWeight} onChange={(event) => setActivityWeight(Math.max(0, Math.min(10, Number(event.target.value) || 0)))} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal" /></label><div className="rounded-lg bg-surface p-3 text-sm"><p><span className="text-muted-foreground">Peso da prova:</span> <strong>{10 - activityWeight}</strong></p><p className="mt-1 text-xs text-muted-foreground">Os pesos sempre somam 10. Exemplos: 5+5, 7+3 ou 3+7.</p></div></div>{activityFileName && <p className="mt-3 text-sm text-success">Arquivo lido: {activityFileName} · {activityGrades.length} notas válidas.</p>}{activityError && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm">{activityError}</p>}{weightedExam !== "all" && activityGrades.length > 0 && <p className="mt-3 text-sm text-muted-foreground">{matchedCount} de {weightedResults.length} alunos encontrados por matrícula, chamada ou nome.</p>}<button type="button" onClick={exportWeightedExcel} disabled={weightedExam === "all" || !activityGrades.length || !matchedCount} className="mt-4 min-h-11 rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50">Baixar Excel com notas finais</button></div></section>;
}
