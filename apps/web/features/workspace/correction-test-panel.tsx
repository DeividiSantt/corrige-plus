"use client";

import { useMemo, useState } from "react";

export type TestCorrectionRow = {
  id: string;
  studentName: string;
  examTitle: string;
  score: number | null;
  answers: { questionNumber: number; detectedAnswer: string | null; correctAnswer: string | null; result: string }[];
};

const resultStyle: Record<string, string> = {
  correct: "border-success bg-success-soft text-success",
  incorrect: "border-danger bg-danger-soft text-danger",
  blank: "border-warning bg-warning-soft text-foreground",
  multiple: "border-warning bg-warning-soft text-foreground",
  uncertain: "border-warning bg-warning-soft text-foreground",
};

function resultLabel(result: string) {
  return ({ correct: "Certa", incorrect: "Errada", blank: "Em branco", multiple: "Marcação dupla", uncertain: "Sem confirmação" }[result] || result);
}

export function CorrectionTestPanel({ rows }: { rows: TestCorrectionRow[] }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id || "");
  const row = useMemo(() => rows.find((item) => item.id === selectedId) || rows[0], [rows, selectedId]);
  if (!row) {
    return <section className="rounded-xl border border-border bg-background p-8 text-center"><h2 className="font-bold">Nenhum resultado para testar</h2><p className="mt-2 text-sm text-muted-foreground">Envie e processe ao menos um cartão para conferir a leitura aqui.</p></section>;
  }
  const counts = row.answers.reduce((total, answer) => ({ ...total, [answer.result]: (total[answer.result] || 0) + 1 }), {} as Record<string, number>);
  return <section className="space-y-5 rounded-xl border border-border bg-background p-5 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-lg font-bold">Resultado da leitura</h2><p className="mt-1 text-sm text-muted-foreground">Esta área só exibe a conferência; não altera notas nem resultados oficiais.</p></div>
      <label className="block min-w-0 text-sm font-semibold sm:w-80">Cartão para testar<select value={row.id} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-normal"><option value={row.id}>{row.studentName} · {row.examTitle}</option>{rows.filter((item) => item.id !== row.id).map((item) => <option key={item.id} value={item.id}>{item.studentName} · {item.examTitle}</option>)}</select></label>
    </div>
    <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-4">
      <p><span className="block text-xs font-semibold text-muted-foreground">Certas</span><strong className="text-lg text-success">{counts.correct || 0}</strong></p>
      <p><span className="block text-xs font-semibold text-muted-foreground">Erradas</span><strong className="text-lg text-danger">{counts.incorrect || 0}</strong></p>
      <p><span className="block text-xs font-semibold text-muted-foreground">Em branco / revisar</span><strong className="text-lg">{(counts.blank || 0) + (counts.multiple || 0) + (counts.uncertain || 0)}</strong></p>
      <p><span className="block text-xs font-semibold text-muted-foreground">Nota atual</span><strong className="text-lg">{row.score == null ? "—" : Number(row.score).toFixed(2)}</strong></p>
    </div>
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resultado por questão">
      {row.answers.map((answer) => <li key={answer.questionNumber} className={`rounded-lg border p-3 ${resultStyle[answer.result] || "border-border bg-surface"}`}>
        <div className="flex items-start justify-between gap-3"><strong>Questão {String(answer.questionNumber).padStart(2, "0")}</strong><span className="text-xs font-semibold">{resultLabel(answer.result)}</span></div>
        <p className="mt-2 text-sm">Marcada: <strong>{answer.detectedAnswer || "—"}</strong> <span className="text-muted-foreground">· Gabarito:</span> <strong>{answer.correctAnswer || "—"}</strong></p>
      </li>)}
    </ol>
  </section>;
}
