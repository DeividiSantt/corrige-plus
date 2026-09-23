import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMock = vi.hoisted(() =>
  vi.fn(async (_previousState: unknown, _formData: FormData) => {
    void _previousState;
    void _formData;
    return {
      status: "success" as const,
      message: "Importação concluída.",
      importedCount: 1,
      updatedCount: 0,
      skippedCount: 0,
    };
  }),
);

vi.mock("@/features/workspace/actions", () => ({
  importStudentsAction: actionMock,
}));

vi.mock("@/features/workspace/student-import-state", () => ({
  initialStudentImportState: { status: "idle" },
}));

import { StudentImporter } from "@/features/workspace/student-importer";

function createSpreadsheetFile(
  rows: unknown[][],
  name = "alunos.xlsx",
  sheetName = "Alunos",
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const file = new File([data], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(data),
  });
  return file;
}

function renderImporter() {
  return render(
    createElement(StudentImporter, {
      classes: [{ id: "a14eb177-e556-4e48-88bc-e95692bc7b2f", name: "2º Ano A" }],
      defaultClassId: "a14eb177-e556-4e48-88bc-e95692bc7b2f",
    }),
  );
}

describe("StudentImporter", () => {
  beforeEach(() => actionMock.mockClear());

  it("mantém o envio desabilitado sem planilha", () => {
    renderImporter();
    expect(screen.getByRole("button", { name: "Selecionar planilha" })).toBeDisabled();
  });

  it("mostra leitura, prévia e habilita o envio somente quando estiver pronto", async () => {
    renderImporter();
    const file = createSpreadsheetFile([
      ["Nome", "Matrícula", "Número da chamada"],
      ["Ana Clara", "001245", 1],
      ["", "001246", 2],
    ]);

    fireEvent.change(screen.getByLabelText("Planilha"), { target: { files: [file] } });
    expect(screen.getByRole("status")).toHaveTextContent("Lendo planilha…");

    await screen.findByText("Ana Clara");
    expect(screen.getByText("Nome não informado.")).toBeInTheDocument();
    expect(screen.getByText("001245")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar 1 aluno" })).toBeEnabled();
  });

  it("explica quando não encontra cabeçalhos e não permite envio", async () => {
    renderImporter();
    const file = createSpreadsheetFile([
      ["Código", "E-mail"],
      ["1", "teste@exemplo.com"],
    ]);

    fireEvent.change(screen.getByLabelText("Planilha"), { target: { files: [file] } });

    expect(
      await screen.findByText(
        "Não foi possível identificar as colunas da planilha. Use Nome, Matrícula e Número da chamada.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar planilha" })).toBeDisabled();
  });

  it("envia somente o payload válido e mostra o resumo da ação", async () => {
    renderImporter();
    const file = createSpreadsheetFile([
      ["Nome", "Matrícula", "Número da chamada"],
      ["Ana Clara", "001245", 1],
    ]);
    fireEvent.change(screen.getByLabelText("Planilha"), { target: { files: [file] } });
    const submit = await screen.findByRole("button", { name: "Importar 1 aluno" });
    fireEvent.click(submit);

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const submittedFormData = actionMock.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(submittedFormData.get("studentsPayload")))).toEqual([
      { fullName: "Ana Clara", registrationNumber: "001245", callNumber: 1 },
    ]);
    expect(await screen.findByText("1 importado(s), 0 atualizado(s) e 0 ignorado(s).")).toBeInTheDocument();
  });
});
