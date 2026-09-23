import { ResultsExport } from "@/features/workspace/results-export";
import { workspaceData } from "@/features/workspace/data";

export default async function ExportsPage() {
  const { supabase, organizationId } = await workspaceData();
  const { data: sheets } = await supabase
    .from("answer_sheets")
    .select("id,exam_version_id,score,correct_answers,incorrect_answers,blank_answers,processed_at,status,students(full_name,registration_number,call_number),classes(name),exams(title,subject,exam_date,total_score),detected_answers(question_number,result,correct_answer)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .is("purged_at", null)
    .order("processed_at", { ascending: false });

  const versionIds = [...new Set((sheets || []).map((sheet) => sheet.exam_version_id).filter(Boolean))];
  const [{ data: subjectBlocks }, { data: questions }] = versionIds.length
    ? await Promise.all([
        supabase
          .from("exam_subject_blocks")
          .select("exam_version_id,subject,start_question_number,end_question_number,position")
          .in("exam_version_id", versionIds)
          .order("position"),
        supabase
          .from("exam_questions")
          .select("exam_version_id,question_number,score_value")
          .in("exam_version_id", versionIds)
          .order("question_number"),
      ])
    : [{ data: [] }, { data: [] }];

  const blocksByVersion = new Map<string, typeof subjectBlocks>();
  for (const block of subjectBlocks || []) {
    const items = blocksByVersion.get(block.exam_version_id) || [];
    items.push(block);
    blocksByVersion.set(block.exam_version_id, items);
  }
  const questionsByVersion = new Map<string, typeof questions>();
  for (const question of questions || []) {
    const items = questionsByVersion.get(question.exam_version_id) || [];
    items.push(question);
    questionsByVersion.set(question.exam_version_id, items);
  }
  const results = (sheets || []).map((sheet) => ({
    ...sheet,
    subject_blocks: blocksByVersion.get(sheet.exam_version_id) || [],
    question_scores: questionsByVersion.get(sheet.exam_version_id) || [],
  }));

  return <main className="mx-auto max-w-5xl p-5 sm:p-8 lg:p-10"><h1 className="text-3xl font-bold">Exportações</h1><p className="mt-2 text-muted-foreground">Baixe relatórios completos, inclusive cartões em processamento, revisão ou com erro.</p><div className="mt-8"><ResultsExport results={results as never[]} /></div></main>;
}
