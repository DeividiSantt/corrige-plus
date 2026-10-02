import Link from "next/link";
import type { Route } from "next";
import { ExamCreateForm } from "@/features/workspace/exam-create-form";
import { deleteExamAction } from "@/features/workspace/actions";
import { ConfirmDeleteForm } from "@/features/workspace/confirm-delete-form";
import { classNameFromRelation } from "@/features/workspace/class-relation";
import { workspaceData } from "@/features/workspace/data";

export default async function ExamsPage() {
  const { supabase, organizationId } = await workspaceData();
  const [{ data: classes }, { data: exams }] = await Promise.all([
    supabase.from("classes").select("id,name,subject").eq("organization_id", organizationId).eq("status", "active").order("name"),
    supabase.from("exams").select("id,title,subject,total_questions,total_score,status,classes(name)").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);
  const examIds = (exams || []).map((exam) => exam.id);
  const { data: examClasses } = examIds.length
    ? await supabase.from("exam_classes").select("exam_id,class_id,classes(name)").in("exam_id", examIds)
    : { data: [] };
  const classNamesByExam = new Map<string, string[]>();
  for (const assignment of examClasses || []) {
    const name = classNameFromRelation(assignment.classes);
    classNamesByExam.set(assignment.exam_id, [...(classNamesByExam.get(assignment.exam_id) || []), name]);
  }
  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-10">
      <Link href="/dashboard" className="text-sm font-semibold text-primary">← Painel</Link>
      <h1 className="mt-4 text-3xl font-bold">Avaliações</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">Crie a avaliação e monte o gabarito clicando nas alternativas. Você só avança quando todas as questões estiverem preenchidas.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_28rem]">
        <section className="rounded-xl border border-border bg-background">
          <div className="border-b border-border p-5"><h2 className="font-bold">Avaliações criadas</h2><p className="mt-1 text-sm text-muted-foreground">Abra uma avaliação para gerar cartões, ver o gabarito e acompanhar a correção.</p></div>
          {exams?.length ? exams.map((exam) => (
            <div key={exam.id} className="flex flex-col gap-3 border-b border-border p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/dashboard/avaliacoes/${exam.id}/cartoes`} className="min-w-0 flex-1 hover:text-primary"><strong>{exam.title}</strong><p className="text-sm text-muted-foreground">Turma(s): {(classNamesByExam.get(exam.id) || [classNameFromRelation(exam.classes)]).join(", ")} · {exam.subject} · {exam.total_questions} questões · {exam.total_score} pontos</p></Link>
              <div className="flex flex-wrap items-center gap-2"><Link href={`/dashboard/avaliacoes/${exam.id}/gabarito` as Route} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-soft">Ver gabarito</Link><ConfirmDeleteForm action={deleteExamAction} fieldName="examId" value={exam.id} message={`Arquivar a avaliação “${exam.title}”? Ela deixará de aparecer nas listas. Os registros relacionados serão preservados para auditoria.`} /></div>
            </div>
          )) : <div className="p-8"><p className="font-semibold">Você ainda não criou nenhuma avaliação.</p><p className="mt-1 text-sm text-muted-foreground">Crie a primeira avaliação ao lado e comece pelo gabarito visual.</p></div>}
        </section>
        <ExamCreateForm classes={(classes || []).map((item) => ({ id: item.id, name: item.name, subject: item.subject }))} />
      </div>
    </main>
  );
}
