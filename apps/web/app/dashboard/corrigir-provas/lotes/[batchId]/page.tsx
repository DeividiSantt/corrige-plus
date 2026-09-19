import { notFound } from "next/navigation";
import Link from "next/link";
import { BatchStatus } from "@/features/correction/batch-status";
import type { ManualStudentCandidate } from "@/features/correction/manual-student-identification";
import { workspaceData } from "@/features/workspace/data";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const { supabase, organizationId } = await workspaceData();
  const { data: batch } = await supabase
    .from("processing_batches")
    .select("id,exam_id,created_by,exams(title),classes(name)")
    .eq("id", batchId)
    .eq("organization_id", organizationId)
    .single();
  if (!batch) notFound();
  const { data: files } = await supabase
    .from("processing_files")
    .select("id,file_name,status,error_code,error_message,confidence,algorithm_version,qr_status,qr_strategy,attempt_count,processing_started_at,processed_at,answer_sheets(score,students(full_name))")
    .eq("batch_id", batchId)
    .order("created_at");
  const { data: availableSheets } = await supabase
    .from("answer_sheets")
    .select("id,status,students(full_name,registration_number,call_number)")
    .eq("organization_id", organizationId)
    .eq("exam_id", batch.exam_id)
    .is("deleted_at", null);
  const manualCandidates = (availableSheets || [])
    .map((sheet) => {
      const relation = sheet.students as { full_name: string; registration_number: string | null; call_number: string | null } | { full_name: string; registration_number: string | null; call_number: string | null }[] | null;
      const student = Array.isArray(relation) ? relation[0] : relation;
      return student
        ? {
            answerSheetId: sheet.id,
            fullName: student.full_name,
            registrationNumber: student.registration_number,
            callNumber: student.call_number,
            hasExistingCorrection: ["corrected", "review_required", "confirmed"].includes(sheet.status),
            canBeSelected: !["uploaded", "queued", "processing"].includes(sheet.status),
          }
        : null;
    })
    .filter((student): student is ManualStudentCandidate => Boolean(student))
    .sort((first, second) => first.fullName.localeCompare(second.fullName, "pt-BR"));
  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/corrigir-provas" className="text-sm font-semibold text-primary">← Corrigir provas</Link>
          <h1 className="mt-4 text-3xl font-bold">Acompanhamento do lote</h1>
          <p className="mt-2 text-muted-foreground">{batch.classes?.[0]?.name} · {batch.exams?.[0]?.title}</p>
        </div>
        <Link
          href="/dashboard/exportacoes"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Exportar notas em PDF
        </Link>
      </div>
      <p className="mt-5 max-w-2xl rounded-lg bg-primary-soft px-4 py-3 text-sm text-foreground">
        O relatório pode ser gerado mesmo se ainda houver cartões em revisão ou com erro. Na próxima tela, selecione a avaliação e clique em <strong>Baixar PDF</strong>.
      </p>
      <div className="mt-8">
        <BatchStatus batchId={batchId} initialFiles={(files || []) as never[]} manualCandidates={manualCandidates} />
      </div>
    </main>
  );
}
