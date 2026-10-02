"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { createExamAction } from "@/features/workspace/actions";

type SubjectBlock = {
  id: number;
  subject: string;
  questionCount: number;
};

const questionTotalOptions = [10, 20, 30, 40, 50];
const alternatives = ["A", "B", "C", "D", "E"];

function SubmitButton({ complete, hasClasses }: { complete: boolean; hasClasses: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={!complete || pending}
      className="h-11 w-full rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Salvando avaliação..." : complete ? "Criar avaliação e continuar" : !hasClasses ? "Selecione ao menos uma turma" : "Preencha o gabarito para continuar"}
    </button>
  );
}

export function ExamCreateForm({ classes }: { classes: { id: string; name: string; subject: string | null }[] }) {
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isMultidisciplinary, setIsMultidisciplinary] = useState(false);
  const [primarySubject, setPrimarySubject] = useState("");
  const [singleQuestionTotal, setSingleQuestionTotal] = useState(10);
  const [blocks, setBlocks] = useState<SubjectBlock[]>([{ id: 1, subject: "", questionCount: 10 }]);
  const [answers, setAnswers] = useState<string[]>(Array(10).fill(""));
  const nextBlockId = useRef(2);

  const totalQuestions = isMultidisciplinary
    ? blocks.reduce((total, block) => total + block.questionCount, 0)
    : singleQuestionTotal;
  const allBlocksValid = blocks.length >= 2 && blocks.every((block) => block.subject.trim().length >= 2 && block.questionCount > 0);
  const totalIsSupported = questionTotalOptions.includes(totalQuestions);
  const answered = useMemo(() => answers.filter(Boolean).length, [answers]);
  const complete = selectedClassIds.length > 0 && totalIsSupported && (!isMultidisciplinary || allBlocksValid) && answers.length === totalQuestions && answers.every(Boolean);

  function resizeAnswers(nextTotal: number) {
    setAnswers((current) => [
      ...current.slice(0, nextTotal),
      ...Array(Math.max(0, nextTotal - current.length)).fill(""),
    ]);
  }

  function setQuestion(index: number, answer: string) {
    setAnswers((current) => {
      const next = [...current];
      next[index] = answer;
      return next;
    });
  }

  function updateBlock(id: number, field: "subject" | "questionCount", value: string) {
    const nextBlocks = blocks.map((block) =>
        block.id === id
          ? { ...block, [field]: field === "questionCount" ? Math.max(0, Number(value)) : value }
          : block,
      );
    setBlocks(nextBlocks);
    resizeAnswers(isMultidisciplinary ? nextBlocks.reduce((total, block) => total + block.questionCount, 0) : singleQuestionTotal);
  }

  function addBlock() {
    const nextBlocks = [...blocks, { id: nextBlockId.current++, subject: "", questionCount: 10 }];
    setBlocks(nextBlocks);
    if (isMultidisciplinary) resizeAnswers(nextBlocks.reduce((total, block) => total + block.questionCount, 0));
  }

  function removeBlock(id: number) {
    const nextBlocks = blocks.filter((block) => block.id !== id);
    setBlocks(nextBlocks);
    if (isMultidisciplinary) resizeAnswers(nextBlocks.reduce((total, block) => total + block.questionCount, 0));
  }

  function changeMode(checked: boolean) {
    setIsMultidisciplinary(checked);
    if (checked) {
      setBlocks([{ id: 1, subject: primarySubject, questionCount: singleQuestionTotal }]);
      nextBlockId.current = 2;
      resizeAnswers(singleQuestionTotal);
    } else {
      resizeAnswers(singleQuestionTotal);
    }
  }

  const blocksPayload = isMultidisciplinary
    ? JSON.stringify(blocks.map(({ subject, questionCount }) => ({ subject: subject.trim(), questionCount })))
    : "";

  return (
    <form action={createExamAction} className="space-y-5 rounded-xl border border-border bg-background p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Nova avaliação</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Monte o gabarito por matéria quando a prova reunir mais de uma disciplina. A numeração continua única no cartão-resposta.
        </p>
      </div>

      <input type="hidden" name="subject" value={isMultidisciplinary ? "Multidisciplinar" : primarySubject} />
      <input type="hidden" name="classIds" value={JSON.stringify(selectedClassIds)} />
      <input type="hidden" name="totalQuestions" value={totalQuestions} />
      <input type="hidden" name="isMultidisciplinary" value={String(isMultidisciplinary)} />
      <input type="hidden" name="blocks" value={blocksPayload} />
      <input type="hidden" name="answers" value={answers.join(" ")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="text-sm font-semibold">
          <legend>Turmas em que será aplicada</legend>
          <div aria-describedby="exam-classes-help" className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
            {classes.map((item) => (
              <label key={item.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 font-normal hover:bg-surface">
                <input
                  type="checkbox"
                  checked={selectedClassIds.includes(item.id)}
                  onChange={(event) => setSelectedClassIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                  className="size-4 accent-primary"
                />
                {item.name}
              </label>
            ))}
            {classes.length === 0 && <p className="p-2 text-sm font-normal text-muted-foreground">Cadastre uma turma antes de criar uma avaliação.</p>}
          </div>
          <span id="exam-classes-help" className="mt-1 block text-xs font-normal text-muted-foreground">
            {selectedClassIds.length > 0 ? `${selectedClassIds.length} turma(s) selecionada(s).` : "Selecione uma ou mais turmas."}
          </span>
        </fieldset>
        <label className="text-sm font-semibold">
          Título
          <input name="title" required placeholder="Ex.: Avaliação do 2º bimestre" className="mt-2 h-11 w-full rounded-lg border border-border px-3" />
        </label>
        {!isMultidisciplinary && (
          <label className="text-sm font-semibold">
            Disciplina
            <input
              required
              value={primarySubject}
              onChange={(event) => setPrimarySubject(event.target.value)}
              placeholder="Ex.: Matemática"
              className="mt-2 h-11 w-full rounded-lg border border-border px-3"
            />
          </label>
        )}
        <label className="text-sm font-semibold">
          Data da aplicação
          <input name="examDate" type="date" className="mt-2 h-11 w-full rounded-lg border border-border px-3" />
        </label>
        {!isMultidisciplinary && (
          <label className="text-sm font-semibold">
            Quantidade de questões
              <select value={singleQuestionTotal} onChange={(event) => { const nextTotal = Number(event.target.value); setSingleQuestionTotal(nextTotal); resizeAnswers(nextTotal); }} className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3">
              {questionTotalOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm font-semibold">
          Valor total de pontos
          <input name="totalScore" required type="number" min="0.1" step="0.1" placeholder="Ex.: 10 pontos" className="mt-2 h-11 w-full rounded-lg border border-border px-3" />
        </label>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="subject-blocks-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 id="subject-blocks-title" className="font-bold">Organização por matéria</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Ative somente se esta prova tiver mais de uma disciplina. Exemplo: Matemática com 10 questões e Biologia com 10 questões.
            </p>
          </div>
          <label className="inline-flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input type="checkbox" checked={isMultidisciplinary} onChange={(event) => changeMode(event.target.checked)} className="size-4 accent-primary" />
            Prova com mais de uma matéria
          </label>
        </div>

        {isMultidisciplinary && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">Blocos da prova</p>
                <p className="text-sm text-muted-foreground">Adicione pelo menos duas matérias e informe quantas questões pertencem a cada uma.</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${totalIsSupported ? "bg-primary-soft text-primary" : "bg-warning-soft text-foreground"}`}>
                Total: {totalQuestions} questões
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {blocks.map((block, index) => (
                <div key={block.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">Matéria {index + 1}</span>
                    </div>
                    <label className="block text-sm font-semibold">
                    Matéria
                      <input value={block.subject} onChange={(event) => updateBlock(block.id, "subject", event.target.value)} placeholder="Ex.: Matemática" className="mt-2 block h-11 w-full rounded-lg border border-border px-3" />
                    </label>
                    <label className="block text-sm font-semibold">
                      Quantidade de questões
                      <input value={block.questionCount || ""} onChange={(event) => updateBlock(block.id, "questionCount", event.target.value)} type="number" min="1" max="50" inputMode="numeric" className="mt-2 block h-11 w-full rounded-lg border border-border px-3" />
                    </label>
                    <button type="button" onClick={() => removeBlock(block.id)} disabled={blocks.length <= 1} aria-label={`Remover bloco ${index + 1}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50">
                      <MinusIcon aria-hidden="true" size={16} />
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addBlock} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-primary hover:bg-primary-soft">
              <PlusIcon aria-hidden="true" size={16} />
              Adicionar matéria
            </button>
            {!totalIsSupported && <p className="mt-3 text-sm text-warning">A soma dos blocos deve resultar em 10, 20, 30, 40 ou 50 questões.</p>}
            {blocks.length < 2 && <p className="mt-3 text-sm text-warning">Adicione outra matéria para concluir uma prova multidisciplinar.</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="answer-key-title" className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 id="answer-key-title" className="font-bold">Gabarito</h3>
            <p className="mt-1 text-sm text-muted-foreground">Clique em A, B, C, D ou E em cada questão. Os blocos ajudam a identificar a matéria, sem alterar a numeração.</p>
          </div>
          <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">{answered}/{totalQuestions} preenchidas</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {answers.map((answer, index) => (
            <div key={index} className="grid grid-cols-[2.5rem_1fr] items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="text-sm font-semibold">{String(index + 1).padStart(2, "0")}</span>
              <div className="grid grid-cols-5 gap-1">
                {alternatives.map((option) => (
                  <button type="button" key={option} aria-label={`Questão ${index + 1}, alternativa ${option}`} aria-pressed={answer === option} onClick={() => setQuestion(index, option)} className={`min-h-9 rounded-md border text-sm font-bold ${answer === option ? "border-primary bg-primary text-white" : "border-border hover:border-primary hover:bg-primary-soft"}`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <SubmitButton complete={complete} hasClasses={selectedClassIds.length > 0} />
    </form>
  );
}
