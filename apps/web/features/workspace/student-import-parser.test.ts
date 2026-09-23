import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  normalizeHeader,
  parseCallNumber,
  parseStudentFile,
  parseStudentWorkbook,
} from "@/features/workspace/student-import-parser";

function workbookFromSheets(sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return workbook;
}

describe("normalizeHeader", () => {
  it.each([
    [" Matrícula ", "matricula"],
    ["NÚMERO DA CHAMADA", "numero da chamada"],
    ["nome_completo", "nome completo"],
    ["Nome\nAluno", "nome aluno"],
    ["\u200BNome\uFEFF", "nome"],
    ["registration-number", "registration number"],
  ])("normaliza %j", (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe("parseCallNumber", () => {
  it.each([
    [1, 1],
    ["1", 1],
    [" 01 ", 1],
    [9999, 9999],
    [0, undefined],
    [-1, undefined],
    [1.5, undefined],
    ["texto", undefined],
    [10000, undefined],
  ])("converte %j", (input, expected) => {
    expect(parseCallNumber(input)).toBe(expected);
  });
});

describe("parseStudentWorkbook", () => {
  it.each([
    [["Nome", "Matrícula", "Número da chamada"]],
    [["Nome", "Matricula", "Numero da chamada"]],
    [["nome", "matricula", "numero da chamada"]],
    [["NOME", "MATRÍCULA", "NÚMERO DA CHAMADA"]],
    [[" Nome ", " Matrícula ", " Número da chamada "]],
    [["\u200BNome", "Matrícula\uFEFF", "Número_da_chamada"]],
    [["nome_completo", "registration_number", "call_number"]],
  ])("aceita variação de cabeçalho %j", (headers) => {
    const result = parseStudentWorkbook(
      workbookFromSheets({ Alunos: [headers, ["Ana Clara", "001245", " 01 "]] }),
    );
    expect(result.validStudents[0]).toMatchObject({
      fullName: "Ana Clara",
      registrationNumber: "001245",
      callNumber: 1,
      sourceRow: 2,
    });
  });

  it("detecta cabeçalho depois de uma linha de título", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        "Turma 2A": [
          ["RELAÇÃO DE ALUNOS – 2º ANO A"],
          ["Nome", "Matrícula", "Número da chamada"],
          ["Ana Clara", "20260001", 1],
        ],
      }),
    );
    expect(result.selectedSheet).toBe("Turma 2A");
    expect(result.validStudents[0].sourceRow).toBe(3);
  });

  it("ignora a primeira aba vazia e seleciona a aba com alunos", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Instruções: [],
        Alunos: [
          ["Nome", "Matrícula"],
          ["Ana Clara", "20260001"],
        ],
      }),
    );
    expect(result.selectedSheet).toBe("Alunos");
    expect(result.validStudents).toHaveLength(1);
  });

  it("seleciona a primeira aba válida e avisa sobre outras abas válidas", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        "Turma A": [["Nome"], ["Ana Clara"]],
        "Turma B": [["Nome"], ["Arthur Silva"]],
      }),
    );
    expect(result.selectedSheet).toBe("Turma A");
    expect(result.warnings[0]).toContain("Outras 1 aba");
  });

  it("aceita matrícula ausente", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Alunos: [
          ["Nome", "Matrícula", "Número"],
          ["Ana Clara", "", 2],
        ],
      }),
    );
    expect(result.validStudents[0]).toMatchObject({ fullName: "Ana Clara", callNumber: 2 });
    expect(result.validStudents[0].registrationNumber).toBeUndefined();
  });

  it("preserva matrícula textual com zero à esquerda", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({ Alunos: [["Nome", "Matrícula"], ["Ana Clara", "001245"]] }),
    );
    expect(result.validStudents[0].registrationNumber).toBe("001245");
  });

  it("converte matrícula numérica para texto e emite aviso", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({ Alunos: [["Nome", "Matrícula"], ["Ana Clara", 20260001]] }),
    );
    expect(result.validStudents[0].registrationNumber).toBe("20260001");
    expect(result.warnings.join(" ")).toContain("lidas como número");
  });

  it("mantém aluno com chamada inválida e apresenta aviso", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Alunos: [["Nome", "Número da chamada"], ["Ana Clara", "um"]],
      }),
    );
    expect(result.validStudents).toHaveLength(1);
    expect(result.validStudents[0].callNumber).toBeUndefined();
    expect(result.validStudents[0].warnings[0]).toContain("inválido");
  });

  it("rejeita linha sem nome e ignora linha vazia", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Alunos: [
          ["Nome", "Matrícula"],
          ["", "20260001"],
          ["", ""],
        ],
      }),
    );
    expect(result.validStudents).toHaveLength(0);
    expect(result.rejectedRows).toHaveLength(1);
    expect(result.rejectedRows[0].reason).toBe("Nome não informado.");
  });

  it("rejeita matrícula duplicada dentro do arquivo", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Alunos: [
          ["Nome", "Matrícula"],
          ["Ana Clara", "20260001"],
          ["Arthur Silva", "20260001"],
        ],
      }),
    );
    expect(result.validStudents).toHaveLength(1);
    expect(result.rejectedRows[0].reason).toContain("duplicada");
  });

  it("retorna orientação quando não encontra cabeçalho", () => {
    const result = parseStudentWorkbook(
      workbookFromSheets({ Dados: [["Código", "E-mail"], ["1", "teste@exemplo.com"]] }),
    );
    expect(result.validStudents).toHaveLength(0);
    expect(result.detectedHeaders).toHaveLength(0);
    expect(result.warnings[0]).toContain("Não foi possível identificar");
  });

  it("reconhece uma planilha oficial com 45 alunos", () => {
    const rows = Array.from({ length: 45 }, (_, index) => [
      `Aluno ${String(index + 1).padStart(2, "0")}`,
      String(20260001 + index),
      index + 1,
    ]);
    const result = parseStudentWorkbook(
      workbookFromSheets({
        Alunos: [["Nome", "Matrícula", "Número da chamada"], ...rows],
      }),
    );
    expect(result.rawRowCount).toBe(45);
    expect(result.validStudents).toHaveLength(45);
    expect(result.rejectedRows).toHaveLength(0);
    expect(result.validStudents.every((student) => student.registrationNumber)).toBe(true);
    expect(result.validStudents.every((student) => student.callNumber)).toBe(true);
  });

  it.each([
    ["Nome,Matrícula,Número da chamada\nAna Clara,001245,1"],
    ["Nome;Matrícula;Número da chamada\nAna Clara;001245;1"],
  ])("lê CSV UTF-8 com delimitador comum", (csv) => {
    const encoded = new TextEncoder().encode(csv);
    const data = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer;
    const result = parseStudentFile(data, "alunos.csv");
    expect(result.validStudents[0]).toMatchObject({
      fullName: "Ana Clara",
      registrationNumber: "001245",
      callNumber: 1,
    });
  });
});
