import Link from "next/link";
import type { Route } from "next";
import { DownloadAnswerSheetsButton } from "@/features/workspace/answer-sheet-pdf";
import { classNameFromRelation } from "@/features/workspace/class-relation";
import { workspaceData } from "@/features/workspace/data";

export default async function AnswerSheetsPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { supabase, organizationId } = await workspaceData();
  const { data: exam } = await supabase
    .from("exams")
    .select("id,title,subject,exam_date,total_questions,alternatives_count,classes(name)")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .single();
  const { data: sheets } = await supabase
    .from("answer_sheets")
    .select("secure_token,students(full_name,registration_number,call_number)")
    .eq("exam_id", examId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (!exam) return <main className="p-8">Avaliação não encontrada.</main>;

  const { data: version } = await supabase
    .from("exam_versions")
    .select("id")
    .eq("exam_id", examId)
    .eq("code", "A")
    .maybeSingle();
  const { data: blocks } = version
    ? await supabase
        .from("exam_subject_blocks")
        .select("subject,start_question_number,end_question_number,position")
        .eq("exam_version_id", version.id)
        .order("position")
    : { data: [] };

  const data = (sheets || [])
    .map((sheet) => {
      const student = Array.isArray(sheet.students) ? sheet.students[0] : sheet.students;
      const className = classNameFromRelation(exam.classes);
      return {
        token: sheet.secure_token,
        student: {
          name: student?.full_name || "Aluno",
          registration: student?.registration_number,
          callNumber: student?.call_number,
        },
        exam: {
          title: exam.title,
          subject: exam.subject,
          date: exam.exam_date,
          className,
          questions: exam.total_questions,
          alternatives: exam.alternatives_count,
          subjectBlocks: blocks || [],
        },
      };
    })
    .sort(
      (a, b) =>
        (a.student.callNumber ?? 999999) - (b.student.callNumber ?? 999999) ||
        a.student.name.localeCompare(b.student.name),
    );

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <Link href="/dashboard/avaliacoes" className="text-sm font-semibold text-primary">← Avaliações</Link>
      <h1 className="mt-4 text-3xl font-bold">Cartões-resposta</h1>
      <p className="mt-2 text-muted-foreground">{exam.title} · Turma: {classNameFromRelation(exam.classes)} · versão A · {data.length} alunos</p>
      <div className="mt-8 rounded-xl border bg-background p-6">
        <div className="flex flex-wrap gap-3">
          <DownloadAnswerSheetsButton sheets={data} />
          <Link href={`/dashboard/avaliacoes/${examId}/gabarito` as Route} className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-surface">Ver gabarito</Link>
          <Link href={{ pathname: "/dashboard/corrigir-provas", query: { avaliacao: examId } }} className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-surface">Enviar cartões preenchidos</Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">O PDF contém uma página A4 por aluno, ordenada pelo número da chamada e com QR Code não identificável publicamente.</p>
      </div>
    </main>
  );
}
