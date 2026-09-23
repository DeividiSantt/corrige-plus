import * as XLSX from "xlsx";

const INVISIBLE_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const HEADER_SCAN_LIMIT = 10;

export const STUDENT_HEADER_ALIASES = {
  fullName: [
    "nome",
    "nome do aluno",
    "nome aluno",
    "nome completo",
    "aluno",
    "full name",
    "fullname",
    "full_name",
  ],
  registrationNumber: [
    "matricula",
    "numero de matricula",
    "numero da matricula",
    "registro",
    "numero de registro",
    "registration number",
    "registrationnumber",
    "registration_number",
    "ra",
  ],
  callNumber: [
    "numero da chamada",
    "numero chamada",
    "chamada",
    "numero",
    "n",
    "nº",
    "no",
    "call number",
    "callnumber",
    "call_number",
    "student number",
  ],
} as const;

export type StudentImportRow = {
  fullName: string;
  registrationNumber?: string;
  callNumber?: number;
  sourceRow: number;
  warnings: string[];
};

export type RejectedStudentRow = {
  sourceRow: number;
  reason: string;
  fullName?: string;
  registrationNumber?: string;
  callNumber?: number;
};

export type StudentImportResult = {
  validStudents: StudentImportRow[];
  rejectedRows: RejectedStudentRow[];
  detectedHeaders: string[];
  selectedSheet: string;
  warnings: string[];
  rawRowCount: number;
};

type StudentField = keyof typeof STUDENT_HEADER_ALIASES;
type HeaderCandidate = {
  rowIndex: number;
  score: number;
  fields: Partial<Record<StudentField, number>>;
  headers: string[];
};

const normalizedAliases = new Map<string, StudentField>();
for (const [field, aliases] of Object.entries(STUDENT_HEADER_ALIASES) as [
  StudentField,
  readonly string[],
][]) {
  for (const alias of aliases) normalizedAliases.set(normalizeHeader(alias), field);
}

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?|\n/g, " ")
    .replace(INVISIBLE_CHARACTERS, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCellText(value: unknown): string {
  return String(value ?? "")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCallNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || cleanCellText(value) === "") return undefined;
  const text = cleanCellText(value);
  if (!/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 9999 ? parsed : undefined;
}

function asRows(value: unknown[][]): unknown[][] {
  return value.map((row) => (Array.isArray(row) ? row : []));
}

function detectHeader(rows: unknown[][]): HeaderCandidate | undefined {
  let best: HeaderCandidate | undefined;

  rows.slice(0, HEADER_SCAN_LIMIT).forEach((row, rowIndex) => {
    const fields: Partial<Record<StudentField, number>> = {};
    const headers = row.map((value) => cleanCellText(value));

    headers.forEach((header, columnIndex) => {
      const field = normalizedAliases.get(normalizeHeader(header));
      if (field && fields[field] === undefined) fields[field] = columnIndex;
    });

    if (fields.fullName === undefined) return;
    const recognizedCount = Object.keys(fields).length;
    const score = recognizedCount * 100 - rowIndex;
    if (!best || score > best.score) best = { rowIndex, score, fields, headers };
  });

  return best;
}

function valueAt(row: unknown[], column: number | undefined): unknown {
  return column === undefined ? undefined : row[column];
}

function isEmptyRow(row: unknown[]): boolean {
  return row.every((value) => cleanCellText(value) === "");
}

function parseSheet(workbook: XLSX.WorkBook, sheetName: string): StudentImportResult | undefined {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return undefined;

  const rawRows = asRows(
    XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true,
    }),
  );
  const formattedRows = asRows(
    XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: true,
    }),
  );
  const header = detectHeader(formattedRows);
  if (!header) return undefined;

  const validStudents: StudentImportRow[] = [];
  const rejectedRows: RejectedStudentRow[] = [];
  const warnings: string[] = [];
  const registrations = new Set<string>();
  let rawRowCount = 0;
  let numericRegistrationCount = 0;

  for (let index = header.rowIndex + 1; index < formattedRows.length; index += 1) {
    const formattedRow = formattedRows[index] ?? [];
    const rawRow = rawRows[index] ?? [];
    if (isEmptyRow(formattedRow)) continue;
    rawRowCount += 1;

    const sourceRow = index + 1;
    const fullName = cleanCellText(valueAt(formattedRow, header.fields.fullName));
    const registrationValue = valueAt(formattedRow, header.fields.registrationNumber);
    const registrationNumber = cleanCellText(registrationValue) || undefined;
    const rawRegistrationValue = valueAt(rawRow, header.fields.registrationNumber);
    const callValue = valueAt(formattedRow, header.fields.callNumber);
    const callText = cleanCellText(callValue);
    const callNumber = parseCallNumber(callValue);
    const rowWarnings: string[] = [];

    if (typeof rawRegistrationValue === "number" && registrationNumber) {
      numericRegistrationCount += 1;
    }
    if (callText && callNumber === undefined) {
      rowWarnings.push(`Linha ${sourceRow}: número da chamada inválido; o aluno será importado sem esse número.`);
    }

    if (fullName.length < 2) {
      rejectedRows.push({
        sourceRow,
        reason: fullName ? "O nome deve ter pelo menos 2 caracteres." : "Nome não informado.",
        fullName: fullName || undefined,
        registrationNumber,
        callNumber,
      });
      continue;
    }
    if (fullName.length > 180) {
      rejectedRows.push({
        sourceRow,
        reason: "O nome deve ter no máximo 180 caracteres.",
        fullName,
        registrationNumber,
        callNumber,
      });
      continue;
    }
    if (registrationNumber && registrationNumber.length > 80) {
      rejectedRows.push({
        sourceRow,
        reason: "A matrícula deve ter no máximo 80 caracteres.",
        fullName,
        registrationNumber,
        callNumber,
      });
      continue;
    }
    if (registrationNumber && registrations.has(registrationNumber)) {
      rejectedRows.push({
        sourceRow,
        reason: "Matrícula duplicada dentro do arquivo.",
        fullName,
        registrationNumber,
        callNumber,
      });
      continue;
    }

    if (registrationNumber) registrations.add(registrationNumber);
    warnings.push(...rowWarnings);
    validStudents.push({
      fullName,
      registrationNumber,
      callNumber,
      sourceRow,
      warnings: rowWarnings,
    });
  }

  if (numericRegistrationCount > 0) {
    warnings.push(
      `${numericRegistrationCount} matrícula(s) foram lidas como número. Para preservar zeros à esquerda, formate a coluna como texto.`,
    );
  }

  return {
    validStudents,
    rejectedRows,
    detectedHeaders: header.headers.filter(Boolean),
    selectedSheet: sheetName,
    warnings,
    rawRowCount,
  };
}

export function parseStudentWorkbook(workbook: XLSX.WorkBook): StudentImportResult {
  const candidates = workbook.SheetNames.map((sheetName) => parseSheet(workbook, sheetName)).filter(
    (result): result is StudentImportResult => Boolean(result),
  );
  const validCandidates = candidates.filter((candidate) => candidate.validStudents.length > 0);
  const selected = validCandidates[0] ?? candidates[0];

  if (!selected) {
    return {
      validStudents: [],
      rejectedRows: [],
      detectedHeaders: [],
      selectedSheet: "",
      warnings: [
        "Não foi possível identificar as colunas da planilha. Use Nome, Matrícula e Número da chamada.",
      ],
      rawRowCount: 0,
    };
  }

  const additionalValidSheets = validCandidates.slice(1);
  if (additionalValidSheets.length > 0) {
    selected.warnings.unshift(
      `A aba “${selected.selectedSheet}” foi selecionada. Outras ${additionalValidSheets.length} aba(s) também contêm alunos.`,
    );
  } else {
    selected.warnings.unshift(`A aba “${selected.selectedSheet}” foi selecionada para importação.`);
  }

  return selected;
}

export function parseStudentFile(data: ArrayBuffer, fileName = ""): StudentImportResult {
  const isCsv = fileName.toLocaleLowerCase("pt-BR").endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(data).replace(/^\uFEFF/, ""), {
        type: "string",
        cellText: true,
      })
    : XLSX.read(data, { type: "array", cellText: true });
  return parseStudentWorkbook(workbook);
}
