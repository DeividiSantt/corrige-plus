"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { canIdentifyStudentManually, canReprocessFile, correctionErrorMessages } from "@/features/correction/qr-errors";
import { CorrectionLoader } from "./correction-loader";
import { ManualStudentIdentification, type ManualStudentCandidate } from "./manual-student-identification";

type FileRow = {
  id: string;
  file_name: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  confidence: number | null;
  algorithm_version: string | null;
  qr_status: string | null;
  qr_strategy: string | null;
  attempt_count: number;
  processing_started_at: string | null;
  processed_at: string | null;
  answer_sheets:
    | { score: number | null; students: { full_name: string } | { full_name: string }[] | null }
    | { score: number | null; students: { full_name: string } | { full_name: string }[] | null }[]
    | null;
};

const labels: Record<string, string> = {
  waiting: "Aguardando processamento",
  processing: "Processando",
  completed: "Processado",
  review_required: "Revisão necessária",
  failed: "Novo envio necessário",
  expired: "Expirado",
  purged: "Excluído",
};

export function BatchStatus({ batchId, initialFiles, manualCandidates }: { batchId: string; initialFiles: FileRow[]; manualCandidates: ManualStudentCandidate[] }) {
  const [files, setFiles] = useState(initialFiles);
  const [availableCandidates, setAvailableCandidates] = useState(manualCandidates);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("processing_files")
      .select("id,file_name,status,error_code,error_message,confidence,algorithm_version,qr_status,qr_strategy,attempt_count,processing_started_at,processed_at,answer_sheets(score,students(full_name))")
      .eq("batch_id", batchId)
      .order("created_at");
    if (data) setFiles(data as FileRow[]);
  }, [batchId]);

  async function reprocess(fileId: string) {
    setRetryingId(fileId);
    setFeedback("");
    setFiles((current) =>
      current.map((file) =>
        file.id === fileId
          ? { ...file, status: "processing", error_code: null, error_message: null }
          : file,
      ),
    );
    try {
      const response = await fetch("/api/correction/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ processingFileId: fileId, reprocess: true }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "Não foi possível reprocessar o cartão.");
      setFeedback("Cartão reprocessado. O resultado do lote foi atualizado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível reprocessar o cartão.");
    } finally {
      await refresh();
      setRetryingId(null);
    }
  }

  async function completedManualIdentification(answerSheetId: string) {
    setAvailableCandidates((current) => current.filter((candidate) => candidate.answerSheetId !== answerSheetId));
    await refresh();
  }

  const finished = files.length > 0 && files.every((file) => ["completed", "review_required", "failed", "expired", "purged"].includes(file.status));
  useEffect(() => {
    if (finished) return;
    const timer = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [finished, refresh]);

  const counts = useMemo(
    () => ({
      total: files.length,
      completed: files.filter((file) => file.status === "completed").length,
      review: files.filter((file) => file.status === "review_required").length,
      failed: files.filter((file) => file.status === "failed").length,
      active: files.filter((file) => ["waiting", "processing"].includes(file.status)).length,
    }),
    [files],
  );
  const done = counts.completed + counts.review + counts.failed;
  const percentage = counts.total ? Math.round((done / counts.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {feedback && (
        <p role="status" aria-live="polite" className="rounded-lg bg-surface px-4 py-3 text-sm">
          {feedback}
        </p>
      )}
      {counts.active > 0 && <CorrectionLoader activeCount={counts.active} />}
      <section className="rounded-xl border bg-background p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold">Progresso do lote</h2>
            <p className="text-sm text-muted-foreground">{done} de {counts.total} arquivos concluídos</p>
          </div>
          <strong className="text-xl">{percentage}%</strong>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong" aria-label={`${percentage}% concluído`}>
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percentage}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <span>{counts.active} em andamento</span>
          <span>{counts.completed} corrigidos</span>
          <span>{counts.review} em revisão</span>
          <span>{counts.failed} com erro</span>
        </div>
      </section>

      <section className="divide-y rounded-xl border bg-background">
        {files.map((file) => {
          const sheet = Array.isArray(file.answer_sheets) ? file.answer_sheets[0] : file.answer_sheets;
          const student = Array.isArray(sheet?.students) ? sheet.students[0] : sheet?.students;
          return (
            <article key={file.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{file.file_name}</p>
                <p className="text-sm text-muted-foreground">
                  {student?.full_name || "Aluno ainda não identificado"}
                  {typeof sheet?.score === "number" ? ` · Nota ${sheet.score.toFixed(2)}` : ""}
                </p>
                {(file.error_message || file.error_code) && (
                  <p className="mt-1 text-sm text-danger">
                    {file.error_message ||
                      correctionErrorMessages[file.error_code || ""] ||
                      "Não foi possível processar este cartão."}
                  </p>
                )}
                {(file.algorithm_version || file.qr_strategy) && (
                  <details className="mt-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer font-semibold">Detalhes técnicos</summary>
                    <p className="mt-1">
                      {file.algorithm_version || "Versão não registrada"}
                      {file.qr_status ? ` · QR ${file.qr_status}` : ""}
                      {file.attempt_count ? ` · Tentativa ${file.attempt_count}` : ""}
                    </p>
                    {file.qr_strategy && <p className="mt-1 break-all">Estratégia: {file.qr_strategy}</p>}
                  </details>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {canReprocessFile(file.status, file.error_code) && (
                  <button
                    type="button"
                    onClick={() => void reprocess(file.id)}
                    disabled={retryingId !== null}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ArrowClockwiseIcon aria-hidden="true" />
                    {retryingId === file.id ? "Reprocessando…" : "Reprocessar cartão"}
                  </button>
                )}
                {canIdentifyStudentManually(file.status, file.error_code) && (
                  <ManualStudentIdentification
                    processingFileId={file.id}
                    candidates={availableCandidates}
                    onCompleted={completedManualIdentification}
                  />
                )}
                {file.status === "failed" && !canReprocessFile(file.status, file.error_code) && (
                  <Link
                    href="/dashboard/corrigir-provas"
                    className="inline-flex min-h-11 items-center rounded-lg border bg-background px-3 text-sm font-semibold"
                  >
                    Enviar nova foto
                  </Link>
                )}
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">
                  {labels[file.status] || file.status}
                </span>
              </div>
            </article>
          );
        })}
      </section>

      {counts.review > 0 && (
        <Link href="/dashboard/revisao" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-white">
          Abrir revisão manual
        </Link>
      )}
    </div>
  );
}
