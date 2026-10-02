import Link from "next/link";
import { workspaceData } from "@/features/workspace/data";
import { classNameFromRelation } from "@/features/workspace/class-relation";

export default async function AnswerKeyPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { supabase, organizationId } = await workspaceData();
  const { data: exam } = await supabase
    .from("exams")
    .select("id,title,subject,total_questions,total_score,alternatives_count,classes(name)")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();
  if (!exam) return <main className="p-8">Avaliação não encontrada.</main>;
  const { data: assignedClasses } = await supabase
    .from("exam_classes")
    .select("classes(name)")
    .eq("exam_id", examId);
  const classNames = assignedClasses?.map((item) => classNameFromRelation(item.classes)).filter((name) => name !== "Turma não informada");
  const classLabel = classNames?.length ? classNames.join(", ") : classNameFromRelation(exam.classes);
  const { data: version } = await supabase.from("exam_versions").select("id,name,code").eq("exam_id", examId).eq("code", "A").single();
  const { data: questions } = version
    ? await supabase.from("exam_questions").select("question_number,correct_answer,score_value,is_cancelled").eq("exam_version_id", version.id).order("question_number")
    : { data: [] };
  const { data: storedBlocks } = version
    ? await supabase
        .from("exam_subject_blocks")
        .select("subject,start_question_number,end_question_number,position")
        .eq("exam_version_id", version.id)
        .order("position")
    : { data: [] };
  const subjectBlocks = storedBlocks?.length
    ? storedBlocks
    : [{ subject: exam.subject, start_question_number: 1, end_question_number: exam.total_questions, position: 1 }];
  const alternatives = ["A", "B", "C", "D", "E"].slice(0, exam.alternatives_count || 5);
  return (
    <main className="mx-auto max-w-4xl p-5 sm:p-8 lg:p-10">
      <Link href="/dashboard/avaliacoes" className="text-sm font-semibold text-primary">← Avaliações</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Gabarito da avaliação</h1><p className="mt-2 text-muted-foreground">{exam.title} · Turma(s): {classLabel} · {exam.subject}</p></div>
        <Link href={`/dashboard/avaliacoes/${examId}/cartoes`} className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface">Ver cartões</Link>
      </div>
      <section className="mt-8 rounded-xl border border-border bg-background p-5 sm:p-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-4 text-sm">
          <span><span className="text-muted-foreground">Questões:</span> <strong>{exam.total_questions}</strong></span>
          <span><span className="text-muted-foreground">Valor total:</span> <strong>{exam.total_score} pontos</strong></span>
          <span><span className="text-muted-foreground">Versão:</span> <strong>{version?.code || "A"}</strong></span>
          {storedBlocks?.length ? <span><span className="text-muted-foreground">Matérias:</span> <strong>{storedBlocks.length}</strong></span> : null}
        </div>
        {questions?.length ? (
          <div className="mt-5 space-y-6">
            {subjectBlocks.map((block) => {
              const blockQuestions = questions.filter(
                (question) => question.question_number >= block.start_question_number && question.question_number <= block.end_question_number,
              );
              return (
                <section key={block.position} aria-label={`Bloco de ${block.subject}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <h2 className="font-bold">{block.subject}</h2>
                    <span className="text-sm text-muted-foreground">
                      Questões {String(block.start_question_number).padStart(2, "0")}–{String(block.end_question_number).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {blockQuestions.map((question) => (
                      <div key={question.question_number} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                        <span className="font-semibold">Questão {String(question.question_number).padStart(2, "0")}</span>
                        <div className="flex items-center gap-2">
                          {question.is_cancelled ? <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">Anulada</span> : <span className="grid size-9 place-items-center rounded-full bg-primary-soft font-bold text-primary">{question.correct_answer}</span>}
                          <span className="text-xs text-muted-foreground">{Number(question.score_value).toFixed(2)} pt</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        ) : <p className="mt-5 rounded-lg bg-warning-soft p-4 text-sm">O gabarito ainda não foi cadastrado para esta avaliação.</p>}
        <p className="mt-5 text-sm text-muted-foreground">Alternativas disponíveis: {alternatives.join(", ")}. Cada questão exibe a resposta correta e o peso aplicado.</p>
      </section>
    </main>
  );
}
