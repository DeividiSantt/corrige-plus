import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualReviewDecision } from "@/features/workspace/manual-review-decision";
import { workspaceData } from "@/features/workspace/data";

type Relation<T> = T | T[] | null;
function one<T>(value: Relation<T>): T | null { return Array.isArray(value) ? value[0] || null : value; }

export default async function ReviewItemPage({ params }: { params: Promise<{ reviewItemId: string }> }) {
  const { reviewItemId } = await params;
  const { supabase, organizationId } = await workspaceData();
  const { data: item } = await supabase
    .from("review_items")
    .select("id,answer_sheet_id,processing_file_id,question_number,issue_type,reason,confidence,students(full_name),exams(title)")
    .eq("id", reviewItemId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .maybeSingle();
  if (!item) notFound();
  const [{ data: file }, { data: answer }] = await Promise.all([
    supabase.from("processing_files").select("file_name,storage_key").eq("id", item.processing_file_id).maybeSingle(),
    item.answer_sheet_id && item.question_number
      ? supabase.from("detected_answers").select("id,detected_answer,correct_answer,result,confidence,fill_percentages").eq("answer_sheet_id", item.answer_sheet_id).eq("question_number", item.question_number).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const student = one(item.students as Relation<{ full_name: string }>);
  const exam = one(item.exams as Relation<{ title: string }>);
  const { data: signed } = file?.storage_key
    ? await supabase.storage.from("answer-sheet-uploads").createSignedUrl(file.storage_key, 300)
    : { data: null };
  return <main className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
    <Link href="/dashboard/revisao" className="text-sm font-semibold text-primary">← Revisão manual</Link>
    <div className="mt-4 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Conferir cartão</h1><p className="mt-2 text-muted-foreground">{student?.full_name || "Aluno não identificado"} · {exam?.title || "Avaliação"}{item.question_number ? ` · Questão ${item.question_number}` : ""}</p></div><span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">{item.issue_type}</span></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-xl border border-border bg-surface"><div className="border-b border-border bg-background px-4 py-3"><h2 className="font-bold">Foto enviada pelo professor</h2><p className="mt-1 text-sm text-muted-foreground">{file?.file_name || "Arquivo temporário"}</p></div>{signed?.signedUrl ? <img src={signed.signedUrl} alt={`Cartão enviado por ${student?.full_name || "aluno"}`} className="h-auto w-full bg-background" /> : <div className="p-8 text-sm text-muted-foreground">A foto temporária não está mais disponível. Você ainda pode consultar os dados da leitura, mas não confirmar visualmente este cartão.</div>}</section>
      <aside className="rounded-xl border border-border bg-background p-5"><h2 className="font-bold">Resultado da questão</h2>{item.question_number && answer ? <><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Alternativa lida</dt><dd className="font-semibold">{answer.detected_answer || "Em branco"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Gabarito</dt><dd className="font-semibold">{answer.correct_answer || "—"}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Resultado atual</dt><dd className="font-semibold">{answer.result}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Confiança</dt><dd className="font-semibold">{Math.round(Number(answer.confidence || 0) * 100)}%</dd></div></dl><div className="mt-4 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preenchimento lido</p><div className="mt-2 grid grid-cols-5 gap-2">{["A", "B", "C", "D", "E"].map((option) => <div key={option} className="rounded-md bg-surface px-2 py-2 text-center text-xs"><strong className="block">{option}</strong>{Math.round(Number((answer.fill_percentages as Record<string, number> | null)?.[option] || 0) * 100)}%</div>)}</div></div><ManualReviewDecision reviewItemId={item.id} detectedAnswerId={answer.id} detectedAnswer={answer.detected_answer} /></> : <p className="mt-3 text-sm text-muted-foreground">Este caso exige uma ação diferente da conferência de alternativa; reenvie ou identifique o cartão pela tela de correção.</p>}</aside>
    </div>
  </main>;
}
