import type { ImportedStudent } from "@/features/workspace/student-import-schema";

export type ExistingStudentIdentity = {
  id: string;
  class_id: string;
  registration_number: string | null;
  full_name: string;
  call_number: number | null;
};

export type StudentImportPlan = {
  updates: {
    existingId: string;
    existingRegistrationNumber: string | null;
    existingCallNumber: number | null;
    student: ImportedStudent;
  }[];
  newWithRegistration: ImportedStudent[];
  newWithoutRegistration: ImportedStudent[];
  conflicts: ImportedStudent[];
  duplicatePayloadRows: ImportedStudent[];
};

function normalizedName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function createStudentImportPlan(
  students: ImportedStudent[],
  existingStudents: ExistingStudentIdentity[],
  targetClassId: string,
): StudentImportPlan {
  const existingByRegistration = new Map(
    existingStudents
      .filter((student) => student.registration_number)
      .map((student) => [student.registration_number as string, student]),
  );
  const existingByName = new Map<string, ExistingStudentIdentity[]>();
  for (const student of existingStudents.filter((student) => student.class_id === targetClassId)) {
    const key = normalizedName(student.full_name);
    existingByName.set(key, [...(existingByName.get(key) || []), student]);
  }
  const seenRegistrations = new Set<string>();
  const seenNamesWithoutRegistration = new Set<string>();
  const plan: StudentImportPlan = {
    updates: [],
    newWithRegistration: [],
    newWithoutRegistration: [],
    conflicts: [],
    duplicatePayloadRows: [],
  };

  for (const student of students) {
    if (!student.registrationNumber) {
      const nameKey = normalizedName(student.fullName);
      if (seenNamesWithoutRegistration.has(nameKey)) {
        plan.duplicatePayloadRows.push(student);
        continue;
      }
      seenNamesWithoutRegistration.add(nameKey);

      const candidates = existingByName.get(nameKey) || [];
      const existing = student.callNumber === undefined
        ? candidates[0]
        : candidates.find((candidate) => candidate.call_number === student.callNumber) || candidates[0];
      if (existing) {
        plan.updates.push({
          existingId: existing.id,
          existingRegistrationNumber: existing.registration_number,
          existingCallNumber: existing.call_number,
          student,
        });
      } else {
        plan.newWithoutRegistration.push(student);
      }
      continue;
    }
    if (seenRegistrations.has(student.registrationNumber)) {
      plan.duplicatePayloadRows.push(student);
      continue;
    }
    seenRegistrations.add(student.registrationNumber);

    const existing = existingByRegistration.get(student.registrationNumber);
    if (!existing) {
      plan.newWithRegistration.push(student);
    } else if (existing.class_id === targetClassId) {
      plan.updates.push({
        existingId: existing.id,
        existingRegistrationNumber: existing.registration_number,
        existingCallNumber: existing.call_number,
        student,
      });
    } else {
      plan.conflicts.push(student);
    }
  }

  return plan;
}
