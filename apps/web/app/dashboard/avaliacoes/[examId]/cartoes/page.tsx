import Link from "next/link";
import type { Route } from "next";
import { DownloadAnswerSheetsButton } from "@/features/workspace/answer-sheet-pdf";
import { classNameFromRelation } from "@/features/workspace/class-relation";
import { workspaceData } from "@/features/workspace/data";

type SubjectBlock = { subject: string; start_question_number: number; end_question_number: number; position: number };
type PdfSheet = {
  token: string;
  student: { name: string; registration: string | null; callNumber: number | null };
  exam: { title: string; subject: string; date: string | null; className: string; questions: number; alternatives: number; subjectBlocks: SubjectBlock[] };
};

export default async function AnswerSheetsPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const { supabase, organizationId } = await workspaceData();
  const { data: exam } = await supabase
    .from("exams")
    .select("id,title,subject,exam_date,total_questions,alternatives_count")
    .eq("id", examId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!exam) return <main className="p-8">Avaliação não encontrada.</main>;

  const [{ data: sheets }, { data: version }, { data: assignedClasses }] = await Promise.all([
    supabase
      .from("answer_sheets")
      .select("secure_token,class_id,students(full_name,registration_number,call_number),classes(name)")
      .eq("exam_id", examId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase.from("exam_versions").select("id").eq("exam_id", examId).eq("code", "A").maybeSingle(),
    supabase.from("exam_classes").select("class_id,classes(name)").eq("exam_id", examId),
  ]);

  const { data: blocks } = version
    ? await supabase
        .from("exam_subject_blocks")
        .select("subject,start_question_number,end_question_number,position")
        .eq("exam_version_id", version.id)
        .order("position")
    : { data: [] };

  const subjectBlocks: SubjectBlock[] = (blocks || []).map((block) => ({
    subject: block.subject,
    start_question_number: block.start_question_number,
    end_question_number: block.end_question_number,
    position: block.position,
  }));
  const grouped = new Map<string, { classId: string; className: string; sheets: PdfSheet[] }>();
  for (const assignment of assignedClasses || []) {
    grouped.set(assignment.class_id, {
      classId: assignment.class_id,
      className: classNameFromRelation(assignment.classes),
      sheets: [],
    });
  }

  for (const sheet of sheets || []) {
    const student = Array.isArray(sheet.students) ? sheet.students[0] : sheet.students;
    const className = classNameFromRelation(sheet.classes);
    const group: { classId: string; className: string; sheets: PdfSheet[] } =
      grouped.get(sheet.class_id) || { classId: sheet.class_id, className, sheets: [] };
    group.sheets.push({
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
        subjectBlocks,
      },
    });
    grouped.set(sheet.class_id, group);
  }

  const groups = [...grouped.values()];
  for (const group of groups) {
    group.sheets.sort(
      (a, b) =>
        (a.student.callNumber ?? 999999) - (b.student.callNumber ?? 999999) ||
        a.student.name.localeCompare(b.student.name),
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <Link href="/dashboard/avaliacoes" className="text-sm font-semibold text-primary">← Avaliações</Link>
      <h1 className="mt-4 text-3xl font-bold">Cartões-resposta</h1>
      <p className="mt-2 text-muted-foreground">{exam.title} · versão A · {groups.length} turma(s)</p>
      <div className="mt-8 space-y-5">
        {groups.map((group) => (
          <section key={group.classId} className="rounded-xl border bg-background p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">{group.className}</h2>
                <p className="text-sm text-muted-foreground">{group.sheets.length} aluno(s) · {exam.subject} · {exam.total_questions} questões</p>
              </div>
              {group.sheets.length > 0
                ? <DownloadAnswerSheetsButton sheets={group.sheets} />
                : <span className="text-sm text-muted-foreground">Nenhum aluno ativo nesta turma.</span>}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="rounded-xl border bg-background p-6 text-muted-foreground">Ainda não há alunos ativos nas turmas selecionadas para esta avaliação.</p>}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/dashboard/avaliacoes/${examId}/gabarito` as Route} className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-surface">Ver gabarito</Link>
        <Link href={{ pathname: "/dashboard/corrigir-provas", query: { avaliacao: examId } }} className="inline-flex min-h-11 items-center justify-center rounded-lg border bg-background px-4 text-sm font-semibold hover:bg-surface">Enviar cartões preenchidos</Link>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Cada PDF contém uma página A4 por aluno, separado por turma e com QR Code não identificável publicamente.</p>
    </main>
  );
}
