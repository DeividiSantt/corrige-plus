"use client";

import { useActionState, useRef, useState } from "react";
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  importStudentsAction,
  type StudentImportActionState,
} from "@/features/workspace/actions";
import { initialStudentImportState } from "@/features/workspace/student-import-state";
import {
  parseStudentFile,
  type RejectedStudentRow,
  type StudentImportResult,
  type StudentImportRow,
} from "@/features/workspace/student-import-parser";

type ImportReadStatus = "idle" | "reading" | "ready" | "invalid" | "error";
type ClassOption = { id: string; name: string };
type PreviewRow =
  | ({ kind: "valid" } & StudentImportRow)
  | ({ kind: "rejected" } & RejectedStudentRow);

const supportedExtensions = [".xlsx", ".xls", ".csv"];

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLocaleLowerCase("pt-BR") : "";
}

function PreviewTable({ result }: { result: StudentImportResult }) {
  const [expanded, setExpanded] = useState(false);
  const rows: PreviewRow[] = [
    ...result.validStudents.map((student) => ({ ...student, kind: "valid" as const })),
    ...result.rejectedRows.map((row) => ({ ...row, kind: "rejected" as const })),
  ].sort((a, b) => a.sourceRow - b.sourceRow);
  const visibleRows = expanded ? rows : rows.slice(0, 10);

  return (
    <div className="mt-5">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <caption className="sr-only">Prévia das linhas encontradas na planilha</caption>
          <thead className="bg-surface text-[0.8125rem] font-semibold">
            <tr>
              <th className="px-3 py-2.5 text-right">Linha</th>
              <th className="px-3 py-2.5">Nome</th>
              <th className="px-3 py-2.5">Matrícula</th>
              <th className="px-3 py-2.5 text-right">Chamada</th>
              <th className="px-3 py-2.5">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const valid = row.kind === "valid";
              const warning = valid && row.warnings.length > 0;
              return (
                <tr key={`${row.kind}-${row.sourceRow}`} className="border-t border-border align-top">
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                    {row.sourceRow}
                  </td>
                  <td className="max-w-64 px-3 py-3 font-medium">{row.fullName || "—"}</td>
                  <td className="px-3 py-3">{row.registrationNumber || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.callNumber ?? "—"}</td>
                  <td className="max-w-72 px-3 py-3">
                    {valid ? (
                      <span className={warning ? "text-warning" : "text-success"}>
                        {warning ? "Válida com aviso" : "Válida"}
                      </span>
                    ) : (
                      <span className="text-danger">{row.reason}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 min-h-11 text-sm font-semibold text-primary hover:underline"
        >
          {expanded ? "Mostrar somente as 10 primeiras" : `Mostrar todas as ${rows.length} linhas`}
        </button>
      )}
    </div>
  );
}

export function StudentImporter({
  classes,
  defaultClassId = "",
}: {
  classes: ClassOption[];
  defaultClassId?: string;
}) {
  const [actionState, formAction, pending] = useActionState(
    importStudentsAction,
    initialStudentImportState,
  );
  const [readStatus, setReadStatus] = useState<ImportReadStatus>("idle");
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState("");
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId);
  const readSequence = useRef(0);

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const sequence = readSequence.current + 1;
    readSequence.current = sequence;
    setResult(null);
    setReadError("");

    if (!file) {
      setFileName("");
      setReadStatus("idle");
      return;
    }

    setFileName(file.name);
    if (!supportedExtensions.includes(extensionOf(file.name))) {
      setReadStatus("invalid");
      setReadError("Formato não aceito. Envie um arquivo XLSX, XLS ou CSV.");
      return;
    }

    setReadStatus("reading");
    try {
      const parsed = parseStudentFile(await file.arrayBuffer(), file.name);
      if (readSequence.current !== sequence) return;
      setResult(parsed);

      if (parsed.detectedHeaders.length === 0) {
        setReadStatus("invalid");
        setReadError(
          "Não foi possível identificar as colunas da planilha. Use Nome, Matrícula e Número da chamada.",
        );
      } else if (parsed.validStudents.length === 0) {
        setReadStatus("invalid");
        setReadError(
          "Nenhum aluno válido foi encontrado. Confira os cabeçalhos e os dados preenchidos.",
        );
      } else {
        setReadStatus("ready");
      }
    } catch {
      if (readSequence.current !== sequence) return;
      setReadStatus("error");
      setReadError(
        "Não foi possível ler este arquivo. Envie uma planilha XLSX, XLS ou CSV válida.",
      );
    }
  }

  const payload =
    result?.validStudents.map(({ fullName, registrationNumber, callNumber }) => ({
      fullName,
      registrationNumber,
      callNumber,
    })) ?? [];
  const canSubmit =
    readStatus === "ready" && payload.length > 0 && Boolean(selectedClassId) && !pending;
  const buttonLabel = pending
    ? "Importando…"
    : readStatus === "reading"
      ? "Lendo planilha…"
      : payload.length > 0
        ? `Importar ${payload.length} aluno${payload.length === 1 ? "" : "s"}`
        : "Selecionar planilha";

  return (
    <form action={formAction} className="space-y-5 rounded-xl border bg-background p-5" noValidate>
      <div>
        <h2 className="text-lg font-bold">Importar alunos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use uma planilha do Excel ou CSV. Somente o nome é obrigatório.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="student-import-class" className="text-sm font-semibold">
          Turma
        </label>
        <select
          id="student-import-class"
          required
          name="classId"
          value={selectedClassId}
          onChange={(event) => setSelectedClassId(event.target.value)}
          disabled={pending}
          className="h-11 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="" disabled>
            Selecione a turma
          </option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="student-import-file" className="text-sm font-semibold">
          Planilha
        </label>
        <label
          htmlFor="student-import-file"
          className="flex min-h-24 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-surface px-4 py-3 transition-colors duration-200 hover:bg-surface-strong"
        >
          <FileArrowUpIcon size={24} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {fileName || "Escolha um arquivo"}
            </span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              XLSX, XLS ou CSV
            </span>
          </span>
        </label>
        <input
          id="student-import-file"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={readFile}
          disabled={pending}
          className="sr-only"
        />
        <a
          href="/api/modelos/importacao-alunos"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <DownloadSimpleIcon aria-hidden="true" />
          Baixar modelo oficial XLSX
        </a>
      </div>

      <input type="hidden" name="studentsPayload" value={JSON.stringify(payload)} />

      {readStatus === "reading" && (
        <div role="status" aria-live="polite" className="rounded-lg bg-info-soft p-3 text-sm">
          Lendo planilha…
        </div>
      )}

      {readError && (
        <div role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm">
          <WarningCircleIcon
            size={20}
            weight="fill"
            className="mt-0.5 shrink-0 text-danger"
            aria-hidden="true"
          />
          <p>{readError}</p>
        </div>
      )}

      {result && result.detectedHeaders.length > 0 && (
        <div aria-live="polite">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-4 text-sm">
            <p>
              <span className="text-muted-foreground">Aba:</span>{" "}
              <strong>{result.selectedSheet}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Linhas lidas:</span>{" "}
              <strong>{result.rawRowCount}</strong>
            </p>
            <p className="text-success">
              <strong>{result.validStudents.length}</strong> válida(s)
            </p>
            <p className={result.rejectedRows.length ? "text-danger" : "text-muted-foreground"}>
              <strong>{result.rejectedRows.length}</strong> com problema
            </p>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Colunas encontradas: {result.detectedHeaders.join(", ")}
          </p>

          {result.rejectedRows.length > 0 && (
            <div className="mt-4 rounded-lg bg-warning-soft p-3 text-sm">
              <p className="font-semibold">
                A planilha foi lida, mas algumas linhas precisam de correção.
              </p>
              <p className="mt-1">
                As {result.validStudents.length} linhas válidas podem ser importadas agora; as demais
                serão ignoradas.
              </p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <details className="mt-4 rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">
                Ver avisos da leitura ({result.warnings.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-5">
                {result.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`} className="list-disc text-muted-foreground">
                    {warning}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <PreviewTable result={result} />
        </div>
      )}

      {actionState.status !== "idle" && actionState.message && (
        <div
          role={actionState.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`flex gap-2 rounded-lg p-3 text-sm ${
            actionState.status === "error" ? "bg-danger-soft" : "bg-success-soft"
          }`}
        >
          {actionState.status === "error" ? (
            <WarningCircleIcon
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-danger"
              aria-hidden="true"
            />
          ) : (
            <CheckCircleIcon
              size={20}
              weight="fill"
              className="mt-0.5 shrink-0 text-success"
              aria-hidden="true"
            />
          )}
          <div>
            <p className="font-semibold">{actionState.message}</p>
            {actionState.status === "success" && (
              <p className="mt-1">
                {actionState.importedCount ?? 0} importado(s), {actionState.updatedCount ?? 0}{" "}
                atualizado(s) e {actionState.skippedCount ?? 0} ignorado(s).
              </p>
            )}
            {actionState.warnings?.map((warning) => (
              <p key={warning} className="mt-1">
                {warning}
              </p>
            ))}
          </div>
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
      >
        {buttonLabel}
      </Button>
    </form>
  );
}
