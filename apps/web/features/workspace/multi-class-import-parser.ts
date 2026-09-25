import * as XLSX from "xlsx";
import { parseCallNumber, type StudentImportRow, normalizeHeader } from "@/features/workspace/student-import-parser";

export type ImportShift = "morning" | "afternoon" | "evening" | "full_time" | "other";

export type MultiClassStudent = StudentImportRow & {
  selected: boolean;
};

export type MultiClassImportGroup = {
  id: string;
  sourceLabel: string;
  name: string;
  grade?: string;
  shift?: ImportShift;
  schoolYear?: number;
  students: MultiClassStudent[];
  duplicateCount: number;
  rejectedCount: number;
  warnings: string[];
};

export type MultiClassImportResult = {
  groups: MultiClassImportGroup[];
  warnings: string[];
};

type SheetStudent = Omit<MultiClassStudent, "selected">;

const NAME_HEADERS = new Set([
  "nome",
  "nome do aluno",
  "nome aluno",
  "nome completo",
  "aluno",
]);

const REGISTRATION_HEADERS = new Set([
  "matricula",
  "numero de matricula",
  "numero da matricula",
  "registro",
  "ra",
]);

const CALL_HEADERS = new Set([
  "numero da chamada",
  "numero chamada",
  "chamada",
  "numero de ordem",
  "nº ordem",
  "n de ordem",
  "n ordem",
  "no ordem",
  "ordem",
]);

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function keyOf(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function classKey(name: string, schoolYear?: number) {
  return `${keyOf(name)}:${schoolYear ?? "sem-ano"}`;
}

function normalizeShift(value: string): ImportShift | undefined {
  const normalized = keyOf(value);
  if (!normalized) return undefined;
  if (normalized.includes("manha")) return "morning";
  if (normalized.includes("tarde")) return "afternoon";
  if (normalized.includes("noite")) return "evening";
  if (normalized.includes("integral") || normalized.includes("tempo integral")) return "full_time";
  return "other";
}

function metadataFromRows(rows: unknown[][], fallbackName: string) {
  const text = rows.slice(0, 12).flat().map(clean).filter(Boolean).join(" | ");
  const classMatch = text.match(/turma\s*:\s*(.+?)(?=\s*(?:\||s[eé]rie\s*:|turno\s*:|ano\s+letivo\s*:)|$)/i);
  const gradeMatch = text.match(/s[eé]rie\s*:\s*(.+?)(?=\s*(?:\||turma\s*:|turno\s*:|ano\s+letivo\s*:)|$)/i);
  const shiftMatch = text.match(/turno\s*:\s*(.+?)(?=\s*(?:\||turma\s*:|s[eé]rie\s*:|ano\s+letivo\s*:)|$)/i);
  const yearMatch = text.match(/ano\s+letivo\s*:\s*(\d{4})/i);
  return {
    name: clean(classMatch?.[1]) || clean(fallbackName),
    grade: clean(gradeMatch?.[1]) || undefined,
    shift: normalizeShift(clean(shiftMatch?.[1])),
    schoolYear: yearMatch ? Number(yearMatch[1]) : undefined,
  };
}

function columnIndex(row: unknown[], allowed: Set<string>) {
  return row.findIndex((cell) => allowed.has(normalizeHeader(cell)));
}

function studentIdentity(student: SheetStudent) {
  if (student.registrationNumber) return `registration:${keyOf(student.registrationNumber)}`;
  const name = keyOf(student.fullName);
  return student.callNumber ? `name-call:${name}:${student.callNumber}` : `name:${name}`;
}

function extractStudents(rows: unknown[][]) {
  const students: SheetStudent[] = [];
  const warnings: string[] = [];
  let rejectedCount = 0;
  let activeColumns: { name: number; registration: number; call: number } | undefined;

  rows.forEach((row, index) => {
    const nameColumn = columnIndex(row, NAME_HEADERS);
    if (nameColumn >= 0) {
      activeColumns = {
        name: nameColumn,
        registration: columnIndex(row, REGISTRATION_HEADERS),
        call: columnIndex(row, CALL_HEADERS),
      };
      return;
    }
    if (!activeColumns) return;

    const fullName = clean(row[activeColumns.name]);
    if (!fullName) return;
    const normalizedName = normalizeHeader(fullName);
    if (NAME_HEADERS.has(normalizedName) || normalizedName.includes("data da atividade") || normalizedName.includes("pontuacao")) return;
    if (fullName.length < 2 || /^\d+(?:[.,]\d+)?$/.test(fullName)) {
      rejectedCount += 1;
      return;
    }

    const registrationNumber = activeColumns.registration >= 0 ? clean(row[activeColumns.registration]) || undefined : undefined;
    const rawCall = activeColumns.call >= 0 ? row[activeColumns.call] : undefined;
    const callNumber = parseCallNumber(rawCall);
    if (rawCall !== undefined && clean(rawCall) && callNumber === undefined) {
      warnings.push(`Linha ${index + 1}: número da chamada inválido para ${fullName}.`);
    }
    students.push({
      fullName,
      registrationNumber,
      callNumber,
      sourceRow: index + 1,
      warnings: [],
    });
  });

  return { students, warnings, rejectedCount };
}

function mergeGroup(target: MultiClassImportGroup, incoming: SheetStudent[], warnings: string[], rejectedCount: number) {
  const seen = new Set(target.students.map(studentIdentity));
  for (const student of incoming) {
    const identity = studentIdentity(student);
    if (seen.has(identity)) {
      target.duplicateCount += 1;
      continue;
    }
    seen.add(identity);
    target.students.push({ ...student, selected: true });
  }
  target.rejectedCount += rejectedCount;
  target.warnings.push(...warnings);
}

export function parseMultiClassWorkbook(workbook: XLSX.WorkBook): MultiClassImportResult {
  const byClass = new Map<string, MultiClassImportGroup>();
  const warnings: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet?.["!ref"]) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    });
    const metadata = metadataFromRows(rows, sheetName);
    const extracted = extractStudents(rows);
    if (!metadata.name || extracted.students.length === 0) {
      warnings.push(`A aba “${sheetName}” não contém uma turma com alunos identificáveis.`);
      continue;
    }
    const groupKey = classKey(metadata.name, metadata.schoolYear);
    const existing = byClass.get(groupKey);
    if (existing) {
      mergeGroup(existing, extracted.students, extracted.warnings, extracted.rejectedCount);
      continue;
    }
    const group: MultiClassImportGroup = {
      id: groupKey,
      sourceLabel: sheetName,
      name: metadata.name,
      grade: metadata.grade,
      shift: metadata.shift,
      schoolYear: metadata.schoolYear,
      students: [],
      duplicateCount: 0,
      rejectedCount: 0,
      warnings: [...extracted.warnings],
    };
    mergeGroup(group, extracted.students, [], extracted.rejectedCount);
    byClass.set(groupKey, group);
  }

  return { groups: [...byClass.values()], warnings };
}

export function parseMultiClassSpreadsheet(data: ArrayBuffer, fileName: string): MultiClassImportResult {
  const isCsv = fileName.toLocaleLowerCase("pt-BR").endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, ""), { type: "string", cellText: true })
    : XLSX.read(data, { type: "array", cellText: true });
  return parseMultiClassWorkbook(workbook);
}

/** Parses text extracted from a PDF. Image-only PDFs intentionally produce no groups. */
export function parseMultiClassPdfText(text: string, sourceLabel = "PDF"): MultiClassImportResult {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const groups: MultiClassImportGroup[] = [];
  let current: MultiClassImportGroup | undefined;
  const warnings: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const classMatch = line.match(/turma\s*:\s*(.+?)(?=\s*(?:\||s[eé]rie\s*:|turno\s*:|ano\s+letivo\s*:)|$)/i);
    if (classMatch) {
      const name = clean(classMatch[1]);
      const context = lines.slice(Math.max(0, index - 4), index + 4).join(" | ");
      const grade = clean(context.match(/s[eé]rie\s*:\s*(.+?)(?=\s*(?:\||turma\s*:|turno\s*:|ano\s+letivo\s*:)|$)/i)?.[1]) || undefined;
      const shift = normalizeShift(clean(context.match(/turno\s*:\s*(.+?)(?=\s*(?:\||turma\s*:|s[eé]rie\s*:|ano\s+letivo\s*:)|$)/i)?.[1]));
      const yearText = context.match(/ano\s+letivo\s*:\s*(\d{4})/i)?.[1];
      current = {
        id: `${classKey(name, yearText ? Number(yearText) : undefined)}:${groups.length}`,
        sourceLabel,
        name,
        grade,
        shift,
        schoolYear: yearText ? Number(yearText) : undefined,
        students: [],
        duplicateCount: 0,
        rejectedCount: 0,
        warnings: [],
      };
      groups.push(current);
      continue;
    }
    if (!current) continue;
    const studentMatch = line.match(/^(\d{1,4})\s+([A-ZÀ-Ý][A-ZÀ-Ý '\-.]{2,})$/);
    if (!studentMatch) continue;
    const candidate: MultiClassStudent = {
      fullName: clean(studentMatch[2]),
      callNumber: Number(studentMatch[1]),
      sourceRow: index + 1,
      warnings: [],
      selected: true,
    };
    if (current.students.some((student) => studentIdentity(student) === studentIdentity(candidate))) {
      current.duplicateCount += 1;
    } else {
      current.students.push(candidate);
    }
  }

  const validGroups = groups.filter((group) => group.students.length > 0);
  if (validGroups.length === 0) {
    warnings.push("Não foi possível identificar turmas e alunos neste PDF. Envie um PDF com texto selecionável ou uma planilha.");
  }
  return { groups: validGroups, warnings };
}
