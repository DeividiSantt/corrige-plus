"use client";

import { useState } from "react";

export type ManualStudentCandidate = {
  answerSheetId: string;
  fullName: string;
  registrationNumber: string | null;
  callNumber: string | null;
  hasExistingCorrection: boolean;
  canBeSelected: boolean;
};

export function ManualStudentIdentification({
  processingFileId,
  candidates,
  onCompleted,
}: {
  processingFileId: string;
  candidates: ManualStudentCandidate[];
  onCompleted: (answerSheetId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<ManualStudentCandidate | null>(null);
  const [error, setError] = useState("");

  async function confirmIdentification() {
    if (!selected) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/correction/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          processingFileId,
          reprocess: true,
          manualAnswerSheetId: selected.answerSheetId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Não foi possível identificar e corrigir este cartão.");
      setOpen(false);
      setSelected(null);
      await onCompleted(selected.answerSheetId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível identificar e corrigir este cartão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center rounded-lg border bg-background px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
      >
        Identificar aluno
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby={`identify-title-${processingFileId}`}>
          <section className="w-full max-w-xl rounded-xl bg-background p-5 shadow-xl">
            <h2 id={`identify-title-${processingFileId}`} className="text-xl font-bold">Identificar aluno manualmente</h2>
            <p className="mt-2 text-sm text-muted-foreground">Selecione o aluno na lista desta avaliação. A foto será corrigida novamente, sem depender do QR Code.</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
              {candidates.length === 0 && <p className="p-3 text-sm text-muted-foreground">Todos os alunos desta avaliação já possuem um cartão vinculado.</p>}
              {candidates.map((candidate) => (
                <button
                  key={candidate.answerSheetId}
                  type="button"
                  disabled={!candidate.canBeSelected}
                  onClick={() => setSelected(candidate)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selected?.answerSheetId === candidate.answerSheetId ? "bg-primary-soft ring-1 ring-primary" : "hover:bg-surface"} ${candidate.canBeSelected ? "" : "cursor-not-allowed opacity-50"}`}
                >
                  <strong className="block">{candidate.fullName}</strong>
                  <span className="text-muted-foreground">{candidate.registrationNumber ? `Matrícula ${candidate.registrationNumber}` : "Sem matrícula"}{candidate.callNumber ? ` · Chamada ${candidate.callNumber}` : ""}{candidate.hasExistingCorrection ? " · Já possui correção" : ""}{!candidate.canBeSelected ? " · Em processamento" : ""}</span>
                </button>
              ))}
            </div>
            {selected && (
              <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm">
                {selected.hasExistingCorrection
                  ? <>Este aluno já possui uma correção. Ao confirmar, a foto atual vai substituir o resultado anterior de <strong>{selected.fullName}</strong>.</>
                  : <>Você está vinculando esta foto a <strong>{selected.fullName}</strong>. Confira antes de confirmar.</>}
              </p>
            )}
            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setOpen(false); setSelected(null); setError(""); }} disabled={submitting} className="min-h-11 rounded-lg border px-4 text-sm font-semibold">Cancelar</button>
              <button type="button" onClick={() => void confirmIdentification()} disabled={!selected || submitting} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? "Identificando e corrigindo…" : selected?.hasExistingCorrection ? "Substituir correção e corrigir" : "Confirmar aluno e corrigir"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
