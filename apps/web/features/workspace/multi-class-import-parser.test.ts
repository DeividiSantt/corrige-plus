import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseMultiClassPdfText, parseMultiClassWorkbook } from "@/features/workspace/multi-class-import-parser";

function workbookFromSheets(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return workbook;
}

describe("parseMultiClassWorkbook", () => {
  it("identifica todas as turmas e elimina alunos repetidos entre blocos", () => {
    const workbook = workbookFromSheets({
      "101": [
        ["SÉRIE: 1ª", "", "TURMA: 101", "", "TURNO: MANHÃ", "", "ANO LETIVO: 2026"],
        ["Nº ORDEM", "NOME"],
        ["01", "Ana Clara"],
        ["02", "Bruno Silva"],
        ["Nº ORDEM", "NOME"],
        ["01", "Ana Clara"],
        ["02", "Bruno Silva"],
      ],
      "201": [
        ["SÉRIE: 2ª", "", "TURMA: 201", "", "TURNO: TARDE", "", "ANO LETIVO: 2026"],
        ["Nº ORDEM", "NOME"],
        ["01", "Carla Souza"],
      ],
    });

    const result = parseMultiClassWorkbook(workbook);

    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toMatchObject({
      name: "101",
      grade: "1ª",
      shift: "morning",
      schoolYear: 2026,
      duplicateCount: 2,
    });
    expect(result.groups[0].students).toHaveLength(2);
    expect(result.groups[0].students[0].callNumber).toBe(1);
    expect(result.groups[1]).toMatchObject({ name: "201", shift: "afternoon" });
  });

  it("usa o nome da aba como reserva quando não encontra a turma no cabeçalho", () => {
    const workbook = workbookFromSheets({
      "301 TRIL": [["Nº ORDEM", "NOME"], ["01", "Diego Lima"]],
    });
    const result = parseMultiClassWorkbook(workbook);
    expect(result.groups[0]).toMatchObject({ name: "301 TRIL", students: [expect.objectContaining({ fullName: "Diego Lima" })] });
  });
});

describe("parseMultiClassPdfText", () => {
  it("agrupa alunos de um PDF textual", () => {
    const result = parseMultiClassPdfText("TURMA: 104\nSÉRIE: 1ª\nTURNO: MANHÃ\nANO LETIVO: 2026\n01 ANA LIMA\n02 BRUNO SOUZA");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ name: "104", grade: "1ª", shift: "morning" });
    expect(result.groups[0].students).toHaveLength(2);
  });
});
