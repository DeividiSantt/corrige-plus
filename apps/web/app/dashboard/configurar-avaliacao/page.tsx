import Link from "next/link";
import type { Route } from "next";
import { SetupStepper, type SetupStep } from "@/features/workspace/setup-stepper";
import { workspaceData } from "@/features/workspace/data";

export default async function SetupAssessmentPage() {
  const { supabase, organizationId } = await workspaceData();
  const { data: classes } = await supabase.from("classes").select("id,name").eq("organization_id", organizationId).eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false });
  const selectedClass = classes?.[0];
  const { count: studentCount } = selectedClass ? await supabase.from("students").select("id", { count: "exact", head: true }).eq("class_id", selectedClass.id).eq("status", "active").is("deleted_at", null) : { count: 0 };
  const { data: exam } = await supabase.from("exams").select("id,title,class_id,total_questions").eq("organization_id", organizationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { count: questionCount } = exam ? await supabase.from("exam_questions").select("question_number", { count: "exact", head: true }).eq("exam_version_id", (await supabase.from("exam_versions").select("id").eq("exam_id", exam.id).eq("code", "A").maybeSingle()).data?.id || "") : { count: 0 };
  const { count: cardCount } = exam ? await supabase.from("answer_sheets").select("id", { count: "exact", head: true }).eq("exam_id", exam.id).is("deleted_at", null) : { count: 0 };
  const steps: SetupStep[] = [
    { label: "Turma", detail: selectedClass?.name || "Criar turma", href: "/dashboard/turmas", state: selectedClass ? "done" : "current" },
    { label: "Alunos", detail: `${studentCount || 0} cadastrados`, href: selectedClass ? `/dashboard/alunos?turma=${selectedClass.id}` : "/dashboard/turmas", state: !selectedClass ? "locked" : studentCount ? "done" : "current" },
    { label: "Avaliação", detail: exam?.title || "Criar avaliação", href: "/dashboard/avaliacoes", state: !studentCount ? "locked" : exam ? "done" : "current" },
    { label: "Gabarito", detail: exam ? `${questionCount || 0}/${exam.total_questions} questões` : "Após criar avaliação", href: exam ? `/dashboard/avaliacoes/${exam.id}/cartoes` : "/dashboard/avaliacoes", state: !exam ? "locked" : questionCount === exam.total_questions ? "done" : "current" },
    { label: "Cartões", detail: `${cardCount || 0} gerados`, href: exam ? `/dashboard/avaliacoes/${exam.id}/cartoes` : "/dashboard/avaliacoes", state: !exam || questionCount !== exam.total_questions ? "locked" : cardCount ? "done" : "current" },
    { label: "Correção", detail: "Enviar fotos", href: "/dashboard/corrigir-provas", state: !cardCount ? "locked" : "current" },
    { label: "Resultados", detail: "Notas e exportações", href: "/dashboard/exportacoes", state: !cardCount ? "locked" : "current" },
  ];
  const current = steps.find((step) => step.state === "current") || steps[0];
  return <main className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10"><Link href="/dashboard" className="text-sm font-semibold text-primary">← Painel</Link><h1 className="mt-4 text-3xl font-bold">Prepare sua próxima correção</h1><p className="mt-2 max-w-2xl text-muted-foreground">Siga as etapas na ordem. O sistema aproveita o que você já cadastrou e salva o progresso no banco.</p><div className="mt-8"><SetupStepper steps={steps} /></div><section className="mt-6 rounded-xl bg-primary p-6 text-white"><p className="text-sm font-semibold text-white/75">Próxima ação</p><h2 className="mt-2 text-2xl font-bold">{current.label}</h2><p className="mt-2 max-w-xl text-white/85">{current.detail}. Quando terminar, você poderá avançar sem voltar ao menu principal.</p>{current.state !== "locked" && <Link href={current.href as Route} className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-primary">Continuar</Link>}</section></main>;
}
