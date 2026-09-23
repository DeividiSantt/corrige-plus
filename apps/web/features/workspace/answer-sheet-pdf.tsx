"use client";

import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { answerSheetBlockLabel } from "@/features/workspace/answer-sheet-block-label";

type Sheet = {
  token: string;
  student: { name: string; registration?: string | null; callNumber?: number | null };
  exam: {
    title: string;
    subject: string;
    date?: string | null;
    className: string;
    questions: number;
    alternatives: number;
    subjectBlocks?: { subject: string; start_question_number: number; end_question_number: number; position: number }[];
  };
};

export function DownloadAnswerSheetsButton({ sheets, label = "Baixar cartões em PDF" }: { sheets: Sheet[]; label?: string }) {
  async function download() {
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    for (const [index, sheet] of sheets.entries()) {
      if (index) pdf.addPage();
      const { student, exam } = sheet;
      const width = 210; const margin = 14;
      pdf.setDrawColor("#141414"); pdf.setFillColor("#141414"); [[margin, margin], [width - margin - 5, margin], [margin, 282], [width - margin - 5, 282]].forEach(([x, y]) => pdf.rect(x, y, 5, 5, "F"));
      pdf.setFontSize(17); pdf.text("CORRIGE+ · Cartão-resposta", margin, 31);
      const hasSubjectBlocks = Boolean(exam.subjectBlocks?.length);
      const subjectLine = `Turma: ${exam.className} · ${hasSubjectBlocks ? "Prova multidisciplinar" : `Disciplina: ${exam.subject}`}`;
      const blockLine = hasSubjectBlocks
        ? `Blocos da prova: ${exam.subjectBlocks!.map(answerSheetBlockLabel).join(" · ")}`
        : "";
      const headerLines = [
        ...pdf.splitTextToSize(subjectLine, 145),
        ...(blockLine ? pdf.splitTextToSize(blockLine, 145) : []),
      ];
      const studentY = 46 + headerLines.length * 5 + 4;
      const registrationY = studentY + 6;
      const dividerY = registrationY + 6;
      const signatureY = dividerY + 8;
      // A leitura OpenCV utiliza a grade a partir de 92 mm. Os textos acima
      // podem ocupar mais linhas, mas nunca devem mover as bolhas de resposta.
      const answerStartY = 92;
      pdf.setFontSize(10);
      pdf.text(`Avaliação: ${exam.title}`, margin, 40);
      pdf.text(headerLines, margin, 46);
      pdf.text(`Aluno: ${student.name}`, margin, studentY);
      pdf.text(`Matrícula: ${student.registration || "—"} · Chamada: ${student.callNumber ?? "—"} · Versão A`, margin, registrationY);
      pdf.line(margin, dividerY, width - margin, dividerY);
      pdf.text("Assinatura: ______________________________________________________", margin, signatureY);
      const qr = await QRCode.toDataURL(sheet.token, { margin: 1, width: 240, errorCorrectionLevel: "M" }); pdf.addImage(qr, "PNG", 166, 38, 28, 28);
      const columns = exam.questions > 25 ? 2 : 1;
      const perColumn = Math.ceil(exam.questions / columns);
      const options = ["A", "B", "C", "D", "E"].slice(0, exam.alternatives);
      const currentY = Array(columns).fill(answerStartY) as number[];
      for (let question = 1; question <= exam.questions; question++) {
        const column = Math.floor((question - 1) / perColumn);
        const position = (question - 1) % perColumn;
        const x = margin + column * 94;
        const block = exam.subjectBlocks?.find((item) => question >= item.start_question_number && question <= item.end_question_number);
        const startsBlock = Boolean(block && (question === block.start_question_number || position === 0));
        if (startsBlock) {
          // O título precisa ficar fora da área da primeira alternativa do bloco.
          // Mantemos uma distância fixa para não interferir na marcação nem na leitura.
          pdf.setTextColor("#141414");
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.text(answerSheetBlockLabel(block!), x, currentY[column] + 3);
          pdf.setFont("helvetica", "normal");
          currentY[column] += 10;
        }
        const y = hasSubjectBlocks ? currentY[column] : answerStartY + position * 7.2;
        pdf.setFontSize(9);
        pdf.text(String(question).padStart(2, "0"), x, y + 1.5);
        options.forEach((option, optionIndex) => { const bubbleX = x + 14 + optionIndex * 14; pdf.circle(bubbleX, y, 3.3); pdf.text(option, bubbleX - 1.6, y + 1.2); });
        if (hasSubjectBlocks) currentY[column] += 7.2;
      }
      pdf.setFontSize(7); pdf.text("Preencha apenas uma alternativa por questão. Mantenha os quatro marcadores visíveis na foto.", margin, 290);
    }
    pdf.save("cartoes-resposta.pdf");
  }
  return <button type="button" onClick={download} disabled={!sheets.length} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">{label}</button>;
}
