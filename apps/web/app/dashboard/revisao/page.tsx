import Link from "next/link";
import { workspaceData } from "@/features/workspace/data";

const issueLabels: Record<string, string> = {
  multiple: "Marcação dupla",
  low_confidence: "Baixa confiança",
  unreadable: "Questão ilegível",
  qr_unreadable: "QR Code não identificado",
  qr_not_detected: "QR Code não localizado",
  qr_detected_not_decoded: "QR Code localizado, mas ilegível",
  qr_invalid_format: "QR Code fora do formato do CORRIGE+",
  document_not_found: "Bordas do cartão não localizadas",
  INVALID_QR_TOKEN: "QR Code inválido",
  WRONG_EXAM: "Cartão de outra avaliação",
  DUPLICATE_SHEET: "Cartão duplicado",
  QR_DATABASE_ERROR: "Falha ao consultar o cartão",
};

export default async function ReviewPage() {
  const { supabase, organizationId } = await workspaceData();
  const { data: items } = await supabase
    .from("review_items")
    .select("id,processing_file_id,issue_type,reason,confidence,question_number,created_at,students(full_name),exams(title),classes:processing_batches(classes(name))")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at");
  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10">
      <Link href="/dashboard" className="text-sm font-semibold text-primary">← Painel</Link>
      <h1 className="mt-4 text-3xl font-bold">Revisão necessária</h1>
      <p className="mt-2 text-muted-foreground">Somente leituras que dependem da decisão do professor aparecem aqui.</p>
      <section className="mt-8 divide-y rounded-xl border bg-background">
        {items?.length ? items.map((item) => (
          <article key={item.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{item.students?.[0]?.full_name || "Aluno não identificado"}</h2>
                <p className="text-sm text-muted-foreground">{item.exams?.[0]?.title}{item.question_number ? ` · Questão ${item.question_number}` : ""}</p>
              </div>
              <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold">{issueLabels[item.issue_type] || item.issue_type}</span>
            </div>
            {typeof item.confidence === "number" && <p className="mt-3 text-sm">Confiança da leitura: {Math.round(item.confidence * 100)}%</p>}
            <Link href={`/dashboard/revisao/${item.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary-soft">{item.question_number ? "Ver cartão e decidir resultado" : "Ver cartão"}</Link>
          </article>
        )) : <div className="p-8 text-center"><h2 className="font-bold">Nenhuma revisão pendente</h2><p className="mt-1 text-sm text-muted-foreground">Os casos duvidosos aparecerão aqui após o processamento.</p></div>}
      </section>
    </main>
  );
}
