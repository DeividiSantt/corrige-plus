import Link from "next/link";
import { TestCorrectionUploader } from "@/features/correction/test-correction-uploader";
import { workspaceData } from "@/features/workspace/data";

export default async function CorrectionTestPage() {
  const { supabase, organizationId } = await workspaceData();
  const { data: exams } = await supabase
    .from("exams")
    .select("id,title,total_questions,classes(name)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("status", ["ready", "applied", "processing"])
    .order("created_at", { ascending: false });
  const options = (exams || []).map((exam) => ({
    id: exam.id,
    title: exam.title,
    questions: exam.total_questions,
    className: exam.classes?.[0]?.name || "Turma",
  }));
  return <main className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10"><Link href="/dashboard" className="text-sm font-semibold text-primary">← Painel</Link><h1 className="mt-4 text-3xl font-bold">Teste de correção</h1><p className="mt-2 max-w-2xl text-muted-foreground">Envie uma foto por vez para conferir as alternativas certas, erradas e em branco antes de fazer a correção oficial.</p><div className="mt-8"><TestCorrectionUploader exams={options} /></div></main>;
}
