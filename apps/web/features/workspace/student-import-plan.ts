import type { ImportedStudent } from "@/features/workspace/student-import-schema";

export type ExistingStudentIdentity = {
  id: string;
  class_id: string;
  registration_number: string | null;
};

export type StudentImportPlan = {
  updates: { existingId: string; student: ImportedStudent }[];
  newWithRegistration: ImportedStudent[];
  newWithoutRegistration: ImportedStudent[];
  conflicts: ImportedStudent[];
  duplicatePayloadRows: ImportedStudent[];
};

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
  const seenRegistrations = new Set<string>();
  const plan: StudentImportPlan = {
    updates: [],
    newWithRegistration: [],
    newWithoutRegistration: [],
    conflicts: [],
    duplicatePayloadRows: [],
  };

  for (const student of students) {
    if (!student.registrationNumber) {
      plan.newWithoutRegistration.push(student);
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
      plan.updates.push({ existingId: existing.id, student });
    } else {
      plan.conflicts.push(student);
    }
  }

  return plan;
}
