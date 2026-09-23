import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/modelos/importacao-alunos/route";

describe("modelo oficial de importação", () => {
  it("gera um XLSX com colunas oficiais, exemplos fictícios e instruções", async () => {
    const response = await GET();
    const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets.Alunos,
      { header: 1, raw: false },
    );

    expect(response.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(workbook.SheetNames).toEqual(["Alunos", "Instruções"]);
    expect(rows[0]).toEqual(["Nome", "Matrícula", "Número da chamada"]);
    expect(rows[1]).toEqual(["Ana Clara Ribeiro", "001245", "1"]);
  });
});
