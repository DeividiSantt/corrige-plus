"use client";

import { useState } from "react";
import { setManualAnswerResultAction } from "@/features/workspace/actions";

type DecisionType = "answer" | "blank" | "multiple";
const alternatives = ["A", "B", "C", "D", "E"] as const;

export function ManualReviewDecision({ reviewItemId, detectedAnswerId, detectedAnswer }: { reviewItemId: string; detectedAnswerId: string; detectedAnswer: string | null }) {
  const [decisionType, setDecisionType] = useState<DecisionType>("answer");
  const [answer, setAnswer] = useState<string>(detectedAnswer || "");
  const [multipleAnswers, setMultipleAnswers] = useState<string[]>([]);
  const canSubmit = (decisionType === "answer" && Boolean(answer)) || decisionType === "blank" || (decisionType === "multiple" && multipleAnswers.length >= 2);

  function toggleMultipleAnswer(option: string) {
    setMultipleAnswers((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
  }

  return <form action={setManualAnswerResultAction} className="mt-5 space-y-4 border-t border-border pt-5">
    <input type="hidden" name="reviewItemId" value={reviewItemId} />
    <input type="hidden" name="detectedAnswerId" value={detectedAnswerId} />
    <input type="hidden" name="decisionType" value={decisionType} />
    <input type="hidden" name="multipleAnswers" value={multipleAnswers.join(",")} />
    <fieldset>
      <legend className="font-semibold">Decisão do professor</legend>
      <p className="mt-1 text-sm text-muted-foreground">Confira a marcação real. Esta confirmação melhora o leitor, mas nunca muda outras notas automaticamente.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${decisionType === "answer" ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}><input type="radio" checked={decisionType === "answer"} onChange={() => setDecisionType("answer")} /> Uma alternativa</label>
        <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${decisionType === "blank" ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}><input type="radio" checked={decisionType === "blank"} onChange={() => setDecisionType("blank")} /> Em branco</label>
        <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm font-semibold ${decisionType === "multiple" ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}><input type="radio" checked={decisionType === "multiple"} onChange={() => setDecisionType("multiple")} /> Múltiplas</label>
      </div>
      {decisionType === "answer" && <div className="mt-3 grid grid-cols-5 gap-2">{alternatives.map((option) => <label key={option} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-bold ${answer === option ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}><input className="sr-only" type="radio" name="answer" value={option} checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}</div>}
      {decisionType === "multiple" && <div className="mt-3 grid grid-cols-5 gap-2">{alternatives.map((option) => <label key={option} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-bold ${multipleAnswers.includes(option) ? "border-primary bg-primary-soft text-primary" : "border-border bg-background"}`}><input className="sr-only" type="checkbox" checked={multipleAnswers.includes(option)} onChange={() => toggleMultipleAnswer(option)} />{option}</label>)}</div>}
    </fieldset>
    <button type="submit" disabled={!canSubmit} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Salvar decisão e recalcular nota</button>
  </form>;
}
