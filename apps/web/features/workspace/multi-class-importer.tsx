"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { CheckCircleIcon, FileArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { importClassesAndStudentsAction, type MultiClassImportActionState } from "@/features/workspace/actions";
import {
  parseMultiClassPdfText,
  parseMultiClassSpreadsheet,
  type ImportShift,
  type MultiClassImportGroup,
} from "@/features/workspace/multi-class-import-parser";

const initialState: MultiClassImportActionState = { status: "idle" };
const sheetExtensions = [".xlsx", ".xls", ".csv"];
const supportedExtensions = [...sheetExtensions, ".pdf"];
const shifts: { value: ImportShift; label: string }[] = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "evening", label: "Noite" },
  { value: "full_time", label: "Integral" },
  { value: "other", label: "Outro" },
];

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLocaleLowerCase("pt-BR") : "";
}

async function pdfText(data: ArrayBuffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const content = await (await document.getPage(pageNumber)).getTextContent();
    const lines = new Map<number, { x: number; text: string }[]>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5]);
      lines.set(y, [...(lines.get(y) || []), { x, text: item.str }]);
    }
    pages.push([...lines.entries()]
      .sort(([first], [second]) => second - first)
      .map(([, items]) => items.sort((first, second) => first.x - second.x).map((item) => item.text).join(" "))
      .join("\n"));
  }
  return pages.join("\n");
}

function updateGroup(groups: MultiClassImportGroup[], id: string, update: (group: MultiClassImportGroup) => MultiClassImportGroup) {
  return groups.map((group) => group.id === id ? update(group) : group);
}

export function MultiClassImporter() {
  const [actionState, formAction, pending] = useActionState(importClassesAndStudentsAction, initialState);
  const [groups, setGroups] = useState<MultiClassImportGroup[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const sequence = useRef(0);
  const defaultYear = new Date().getFullYear();

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const current = sequence.current + 1;
    sequence.current = current;
    setGroups([]);
    setWarnings([]);
    setError("");
    setFileName(file?.name || "");
    if (!file) return;
    const extension = extensionOf(file.name);
    if (!supportedExtensions.includes(extension)) {
      setError("Formato não aceito. Envie XLSX, XLS, CSV ou PDF com texto selecionável.");
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const result = extension === ".pdf"
        ? parseMultiClassPdfText(await pdfText(data), file.name)
        : parseMultiClassSpreadsheet(data, file.name);
      if (sequence.current !== current) return;
      setGroups(result.groups);
      setWarnings(result.warnings);
      if (result.groups.length === 0) setError("Nenhuma turma com alunos foi identificada neste arquivo.");
    } catch {
      if (sequence.current === current) setError("Não foi possível ler o arquivo. Em PDF, confirme que o texto pode ser selecionado.");
    }
  }

  const payload = useMemo(() => groups
    .filter((group) => group.students.some((student) => student.selected))
    .map((group) => ({
      name: group.name.trim(),
      grade: group.grade?.trim() || "",
      shift: group.shift || "other",
      schoolYear: group.schoolYear || defaultYear,
      students: group.students
        .filter((student) => student.selected)
        .map(({ fullName, registrationNumber, callNumber }) => ({ fullName, registrationNumber, callNumber })),
    })), [groups, defaultYear]);
  const hasMissingDetails = payload.some((group) => !group.name || !group.grade || !group.shift || !group.schoolYear);
  const canSubmit = payload.length > 0 && !hasMissingDetails && !pending;

  return <form action={formAction} className="mt-8 space-y-5 rounded-xl border bg-background p-5" noValidate>
    <div>
      <h2 className="text-lg font-bold">Importar turmas e alunos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Envie uma planilha com várias abas ou um PDF textual. Confira tudo antes de salvar.</p>
    </div>
    <label htmlFor="multi-class-import-file" className="flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-surface px-4 py-3 hover:bg-surface-strong">
      <FileArrowUpIcon size={24} className="shrink-0 text-primary" aria-hidden="true" />
      <span><span className="block text-sm font-semibold">{fileName || "Escolha um arquivo"}</span><span className="block text-sm text-muted-foreground">XLSX, XLS, CSV ou PDF textual</span></span>
    </label>
    <input id="multi-class-import-file" type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" onChange={readFile} disabled={pending} className="sr-only" />
    <input type="hidden" name="groupsPayload" value={JSON.stringify(payload)} />

    {error && <div role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm"><WarningCircleIcon size={20} weight="fill" className="shrink-0 text-danger" /><p>{error}</p></div>}
    {warnings.length > 0 && <div className="rounded-lg bg-warning-soft p-3 text-sm"><p className="font-semibold">Avisos da leitura</p>{warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}</div>}

    {groups.length > 0 && <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{groups.length} turma(s) identificada(s). Desmarque o que não deseja importar.</p>
      {groups.map((group) => {
        const selectedCount = group.students.filter((student) => student.selected).length;
        return <section key={group.id} className="rounded-lg border border-border p-4">
          <label className="flex items-start gap-3"><input type="checkbox" checked={selectedCount > 0} onChange={(event) => setGroups((current) => updateGroup(current, group.id, (item) => ({ ...item, students: item.students.map((student) => ({ ...student, selected: event.target.checked })) })))} disabled={pending} className="mt-1 size-4" /><span><strong>{group.name}</strong><span className="block text-sm text-muted-foreground">{selectedCount} aluno(s) selecionado(s) · origem: {group.sourceLabel}</span></span></label>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-semibold">Série<input value={group.grade || ""} onChange={(event) => setGroups((current) => updateGroup(current, group.id, (item) => ({ ...item, grade: event.target.value })))} placeholder="Ex.: 1º ano" disabled={pending} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 font-normal" /></label>
            <label className="text-sm font-semibold">Turno<select value={group.shift || ""} onChange={(event) => setGroups((current) => updateGroup(current, group.id, (item) => ({ ...item, shift: event.target.value as ImportShift })))} disabled={pending} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 font-normal"><option value="" disabled>Selecione</option>{shifts.map((shift) => <option key={shift.value} value={shift.value}>{shift.label}</option>)}</select></label>
            <label className="text-sm font-semibold">Ano letivo<input type="number" min="2000" max="2200" value={group.schoolYear || defaultYear} onChange={(event) => setGroups((current) => updateGroup(current, group.id, (item) => ({ ...item, schoolYear: Number(event.target.value) || undefined })))} disabled={pending} className="mt-1 h-10 w-full rounded border border-input bg-background px-3 font-normal" /></label>
          </div>
          {(group.duplicateCount > 0 || group.rejectedCount > 0 || group.warnings.length > 0) && <p className="mt-3 text-sm text-muted-foreground">{group.duplicateCount > 0 ? `${group.duplicateCount} repetição(ões) removida(s). ` : ""}{group.rejectedCount > 0 ? `${group.rejectedCount} linha(s) ignorada(s). ` : ""}{group.warnings[0] || ""}</p>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Conferir alunos</summary><div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-border p-2">{group.students.map((student) => <label key={`${student.sourceRow}-${student.fullName}`} className="flex items-center gap-2 py-1"><input type="checkbox" checked={student.selected} onChange={(event) => setGroups((current) => updateGroup(current, group.id, (item) => ({ ...item, students: item.students.map((candidate) => candidate === student ? { ...candidate, selected: event.target.checked } : candidate) })))} disabled={pending} /><span>{student.fullName}{student.callNumber ? ` — chamada ${student.callNumber}` : ""}</span></label>)}</div></details>
        </section>;
      })}
    </div>}

    {actionState.status !== "idle" && actionState.message && <div role={actionState.status === "error" ? "alert" : "status"} className={`flex gap-2 rounded-lg p-3 text-sm ${actionState.status === "error" ? "bg-danger-soft" : "bg-success-soft"}`}>{actionState.status === "success" ? <CheckCircleIcon size={20} weight="fill" className="shrink-0 text-success" /> : <WarningCircleIcon size={20} weight="fill" className="shrink-0 text-danger" />}<p>{actionState.message}</p></div>}
    <Button type="submit" className="w-full" disabled={!canSubmit}>{pending ? "Importando…" : payload.length ? `Importar ${payload.length} turma(s)` : "Selecione um arquivo"}</Button>
  </form>;
}
