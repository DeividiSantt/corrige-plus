import Link from "next/link";
import { workspaceData } from "@/features/workspace/data";
import { deleteAllCorrectionUploadsAction, deleteProcessingFileAction, resetAllAnswerSheetResultsAction, resetAnswerSheetResultAction } from "@/features/workspace/actions";
import { ConfirmDeleteForm } from "@/features/workspace/confirm-delete-form";

type Relation<T> = T | T[] | null;
function one<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] || null : value; }

export default async function CardHistoryPage() {
  const { supabase, organizationId } = await workspaceData();
  const { data: batches } = await supabase.from("processing_batches").select("id").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100);
  const batchIds = (batches || []).map((batch) => batch.id);
  const { data: files } = batchIds.length
    ? await supabase.from("processing_files").select("id,file_name,status,processed_at,created_at,answer_sheets(score,status,result_status,students(full_name),exams(title))").in("batch_id", batchIds).is("deleted_at", null).order("created_at", { ascending: false }).limit(100)
    : { data: [] };
  const rows = (files || []).map((file) => {
    const sheet = one(file.answer_sheets as Relation<{ score: number | null; status: string; result_status: string; students: Relation<{ full_name: string }>; exams: Relation<{ title: string }> }>);
    return { ...file, sheet: sheet ? { score: sheet.score, status: sheet.status, resultStatus: sheet.result_status, student: one(sheet.students), exam: one(sheet.exams) } : null };
  });
  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Histórico de cartões</h1><p className="mt-2 text-muted-foreground">Consulte os cartões enviados e resultados processados.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/exportacoes" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">Exportar resultados</Link>
          <ConfirmDeleteForm
            action={resetAllAnswerSheetResultsAction}
            fieldName="scope"
            value="all"
            label="Limpar todos os resultados"
            message="Limpar as notas e respostas detectadas de todos os cartões corrigidos desta organização? Turmas, avaliações, alunos, cartões, tokens e fotos serão preservados."
          />
          <ConfirmDeleteForm
            action={deleteAllCorrectionUploadsAction}
            fieldName="scope"
            value="all"
            label="Excluir fotos enviadas"
            message="Excluir todas as fotos enviadas para correção e seus registros técnicos? Turmas, alunos, avaliações, cartões gerados, tokens e resultados serão preservados."
          />
        </div>
      </div>
      <section className="mt-8 overflow-hidden rounded-xl border border-border bg-background">
        <div className="divide-y divide-border">
          {rows.length ? rows.map((row) => (
            <article key={row.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{row.sheet?.student?.full_name || "Aluno não identificado"}</p>
                <p className="text-sm text-muted-foreground">{row.sheet?.exam?.title || "Avaliação"} · {row.file_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.processed_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.processed_at)) : "Ainda não processado"} · {row.status}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold">{row.sheet?.score != null ? `Nota ${Number(row.sheet.score).toFixed(2)}` : "Sem nota"}</span>
                <Link href="/dashboard/exportacoes" className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">Salvar PDF/Excel</Link>
                {row.sheet && ["corrected", "review_required", "confirmed", "manually_changed"].includes(row.sheet.status) && (
                  <ConfirmDeleteForm
                    action={resetAnswerSheetResultAction}
                    fieldName="processingFileId"
                    value={row.id}
                    label="Limpar resultado"
                    message={`Limpar a nota e as respostas detectadas de ${row.sheet.student?.full_name || "aluno não identificado"}? O cartão, o aluno, a avaliação e o token serão preservados para um novo envio.`}
                  />
                )}
                <ConfirmDeleteForm action={deleteProcessingFileAction} fieldName="processingFileId" value={row.id} message={`Excluir o cartão enviado de ${row.sheet?.student?.full_name || "aluno não identificado"}? A foto temporária será removida e ele deixará de aparecer no histórico.`} />
              </div>
            </article>
          )) : <div className="p-8 text-center"><p className="font-semibold">Nenhum cartão processado ainda.</p><p className="mt-1 text-sm text-muted-foreground">Os cartões aparecem aqui depois do envio e processamento.</p></div>}
        </div>
      </section>
    </main>
  );
}
