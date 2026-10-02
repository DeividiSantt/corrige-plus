import { describe, expect, it } from "vitest";
import { createStudentImportPlan } from "@/features/workspace/student-import-plan";

describe("createStudentImportPlan", () => {
  it("separa novos, atualizações, conflitos e duplicidades sem mover turma", () => {
    const plan = createStudentImportPlan(
      [
        { fullName: "Mesma turma", registrationNumber: "1", callNumber: 1 },
        { fullName: "Outra turma", registrationNumber: "2", callNumber: 2 },
        { fullName: "Novo com matrícula", registrationNumber: "3" },
        { fullName: "Novo sem matrícula", callNumber: 4 },
        { fullName: "Duplicado no payload", registrationNumber: "3" },
      ],
      [
        { id: "student-1", class_id: "class-a", registration_number: "1", full_name: "Mesma turma", call_number: 1 },
        { id: "student-2", class_id: "class-b", registration_number: "2", full_name: "Outra turma", call_number: 2 },
      ],
      "class-a",
    );

    expect(plan.updates).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.newWithRegistration).toHaveLength(1);
    expect(plan.newWithoutRegistration).toHaveLength(1);
    expect(plan.duplicatePayloadRows).toHaveLength(1);
    expect(plan.conflicts[0].fullName).toBe("Outra turma");
  });

  it("atualiza pelo nome dentro da turma quando a planilha não informa matrícula", () => {
    const plan = createStudentImportPlan(
      [{ fullName: "Ana   Clára de Souza", callNumber: 7 }],
      [{ id: "student-1", class_id: "class-a", registration_number: null, full_name: "ANA CLARA DE SOUZA", call_number: 7 }],
      "class-a",
    );

    expect(plan.updates).toEqual([
      expect.objectContaining({ existingId: "student-1" }),
    ]);
    expect(plan.newWithoutRegistration).toHaveLength(0);
  });
});
