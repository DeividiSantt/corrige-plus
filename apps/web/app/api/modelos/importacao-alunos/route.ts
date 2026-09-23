import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET() {
  const workbook = XLSX.utils.book_new();
  const studentsSheet = XLSX.utils.aoa_to_sheet([
    ["Nome", "Matrícula", "Número da chamada"],
    ["Ana Clara Ribeiro", "001245", 1],
    ["Arthur Gabriel Silva", "001246", 2],
  ]);
  studentsSheet["!cols"] = [{ wch: 32 }, { wch: 18 }, { wch: 22 }];

  const instructionsSheet = XLSX.utils.aoa_to_sheet([
    ["Como usar o modelo"],
    ["A coluna Nome é obrigatória. Matrícula e Número da chamada são opcionais."],
    ["Para preservar zeros à esquerda, mantenha a coluna Matrícula formatada como texto."],
    ["Não altere os títulos das colunas. Você pode apagar as duas linhas de exemplo."],
  ]);
  instructionsSheet["!cols"] = [{ wch: 88 }];

  XLSX.utils.book_append_sheet(workbook, studentsSheet, "Alunos");
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instruções");

  const file = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-alunos.xlsx"',
      "Cache-Control": "private, max-age=3600",
    },
  });
}
