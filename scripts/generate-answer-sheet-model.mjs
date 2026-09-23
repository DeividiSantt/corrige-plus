import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { jsPDF } = require("jspdf");
const QRCode = require("qrcode");

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(rootDirectory, "output", "pdf", "modelo-cartao-tres-materias.pdf");
const pdf = new jsPDF({ unit: "mm", format: "a4" });
const width = 210;
const margin = 14;
const blocks = [
  { subject: "Matemática", start: 1, end: 10 },
  { subject: "Ciências", start: 11, end: 20 },
  { subject: "Biologia", start: 21, end: 30 },
];

pdf.setDrawColor("#141414");
pdf.setFillColor("#141414");
[[margin, margin], [width - margin - 5, margin], [margin, 282], [width - margin - 5, 282]]
  .forEach(([x, y]) => pdf.rect(x, y, 5, 5, "F"));

pdf.setFontSize(17);
pdf.text("CORRIGE+ - Cartão-resposta", margin, 31);
pdf.setFontSize(10);
pdf.text("Avaliação: Modelo de prova multidisciplinar", margin, 40);

const headerLines = [
  ...pdf.splitTextToSize("Turma: 2º ano A - Prova multidisciplinar", 145),
  ...pdf.splitTextToSize(
    `Blocos da prova: ${blocks.map((block) => `${block.subject} - questões ${block.start}-${block.end}`).join(" · ")}`,
    145,
  ),
];
const studentY = 46 + headerLines.length * 5 + 4;
const registrationY = studentY + 6;
const dividerY = registrationY + 6;
const signatureY = dividerY + 8;
const answerStartY = 92;

pdf.text(headerLines, margin, 46);
pdf.text("Aluno: Exemplo de estudante", margin, studentY);
pdf.text("Matrícula: 20260001 · Chamada: 1 · Versão A", margin, registrationY);
pdf.line(margin, dividerY, width - margin, dividerY);
pdf.text("Assinatura: ______________________________________________________", margin, signatureY);

const qr = await QRCode.toDataURL("modelo-cartao-seguro", { margin: 1, width: 240, errorCorrectionLevel: "M" });
pdf.addImage(qr, "PNG", 166, 38, 28, 28);

const columnY = [answerStartY, answerStartY];
blocks.forEach((block, blockIndex) => {
  const column = blockIndex < 2 ? 0 : 1;
  const x = margin + column * 94;
  pdf.setTextColor("#40511F");
  pdf.setFontSize(9);
  pdf.text(`${block.subject} · questões 1-${block.end - block.start + 1}`, x, columnY[column] + 3);
  pdf.setTextColor("#141414");
  columnY[column] += 6.2;
  for (let question = block.start; question <= block.end; question++) {
    const y = columnY[column];
    const localQuestion = question - block.start + 1;
    pdf.setFontSize(9);
    pdf.text(String(localQuestion).padStart(2, "0"), x, y + 1.5);
    ["A", "B", "C", "D", "E"].forEach((option, optionIndex) => {
      const bubbleX = x + 14 + optionIndex * 14;
      pdf.circle(bubbleX, y, 3.3);
      pdf.text(option, bubbleX - 1.6, y + 1.2);
    });
    columnY[column] += 7.2;
  }
});

pdf.setFontSize(7);
pdf.text("Preencha apenas uma alternativa por questão. Mantenha os quatro marcadores visíveis na foto.", margin, 290);
mkdirSync(dirname(outputPath), { recursive: true });
pdf.save(outputPath);
console.log(outputPath);
