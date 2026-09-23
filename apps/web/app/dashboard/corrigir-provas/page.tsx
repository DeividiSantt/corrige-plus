import Link from "next/link";
import { UploadPanel } from "@/features/correction/upload-panel";
import { workspaceData } from "@/features/workspace/data";

export default async function CorrectionUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ avaliacao?: string }>;
}) {
  const { avaliacao } = await searchParams;
  const { supabase, organizationId } = await workspaceData();
  const { data: auth } = await supabase.auth.getUser();
  const { data: exams } = await supabase
    .from("exams")
    .select("id,class_id,title,subject,total_questions,classes(name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("status", ["ready", "applied", "processing"])
    .order("created_at", { ascending: false });

  const options = (exams || []).map((exam) => ({
    id: exam.id,
    classId: exam.class_id,
    className: exam.classes?.[0]?.name || "Turma",
    title: exam.title,
    subject: exam.subject,
    questions: exam.total_questions,
  }));

  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-semibold text-primary">
            ← Painel
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.03em]">Corrigir provas</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Envie os cartões preenchidos. Cada imagem será tratada separadamente, então uma falha não
            interrompe o restante da turma.
          </p>
        </div>
        <Link
          href="/dashboard/exportacoes"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-background px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
        >
          Exportar notas em PDF
        </Link>
      </div>
      <div className="mt-8">
        <UploadPanel
          organizationId={organizationId}
          userId={auth.user!.id}
          exams={options}
          initialExamId={avaliacao}
        />
      </div>
    </main>
  );
}
