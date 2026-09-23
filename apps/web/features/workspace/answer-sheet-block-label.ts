export type AnswerSheetSubjectBlock = {
  subject: string;
  start_question_number: number;
  end_question_number: number;
};

/**
 * The printed range follows the continuous numbering used by the answer
 * sheet and the correction service. It intentionally does not restart at 1
 * for each subject.
 */
export function answerSheetBlockLabel(block: AnswerSheetSubjectBlock) {
  return `${block.subject} · questões ${block.start_question_number}-${block.end_question_number}`;
}
