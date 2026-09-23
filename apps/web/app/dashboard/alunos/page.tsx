import Link from "next/link";
import { workspaceData } from "@/features/workspace/data";
import { StudentImporter } from "@/features/workspace/student-importer";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ turma?: string }> }) {
  const { turma } = await searchParams; const { supabase, organizationId } = await workspaceData();
  const { data: classes } = await supabase.from("classes").select("id,name").eq("organization_id", organizationId).eq("status", "active");
  const { data: students } = turma ? await supabase.from("students").select("id,full_name,registration_number").eq("class_id", turma).order("full_name") : { data: [] };
  return <main className="mx-auto max-w-6xl p-6 sm:p-10"><Link href="/dashboard/turmas" className="text-sm font-semibold text-primary">← Turmas</Link><h1 className="mt-4 text-3xl font-bold">Alunos</h1><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem]"><section className="rounded-xl border bg-background"><div className="border-b p-4 font-semibold">{students?.length || 0} alunos</div>{students?.map((student) => <div key={student.id} className="flex justify-between border-b p-4 last:border-0"><span>{student.full_name}</span><span className="text-muted-foreground">{student.registration_number || "Sem matrícula"}</span></div>)}</section><StudentImporter classes={classes || []} defaultClassId={turma || ""}/></div></main>;
}
