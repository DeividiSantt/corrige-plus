import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

import {
  importStudentsAction,
  type StudentImportActionState,
} from "@/features/workspace/actions";

const organizationId = "f50c007f-12d1-44a4-a9c9-bceba3a4cc8e";
const classId = "a14eb177-e556-4e48-88bc-e95692bc7b2f";
const initialStudentImportState: StudentImportActionState = { status: "idle" };

type SupabaseScenario = {
  classData?: { id: string } | null;
  classError?: { code: string; message: string } | null;
  existingStudents?: { id: string; class_id: string; registration_number: string | null }[];
  registeredInsertIds?: { id: string }[];
  unregisteredInsertIds?: { id: string }[];
};

function resolvedBuilder(result: unknown) {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function createSupabaseScenario(scenario: SupabaseScenario = {}) {
  const calls = {
    update: vi.fn(),
    upsert: vi.fn(),
    insert: vi.fn(),
    rpc: vi.fn(),
  };
  const profileBuilder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async single() {
      return { data: { organization_id: organizationId }, error: null };
    },
  };
  const membershipsBuilder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return Promise.resolve({
        data: [{ organization_id: organizationId, full_name: "Professor", role: "organization_admin", organizations: { name: "Escola", kind: "school" } }],
        error: null,
      });
    },
  };
  const classBuilder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    async maybeSingle() {
      return {
        data: scenario.classData === undefined ? { id: classId } : scenario.classData,
        error: scenario.classError ?? null,
      };
    },
  };
  const studentsTable = {
    select() {
      return {
        eq() {
          return this;
        },
        in() {
          return this;
        },
        async is() {
          return { data: scenario.existingStudents ?? [], error: null };
        },
      };
    },
    update(values: unknown) {
      calls.update(values);
      return resolvedBuilder({ data: null, error: null });
    },
    upsert(values: unknown, options: unknown) {
      calls.upsert(values, options);
      return {
        async select() {
          return { data: scenario.registeredInsertIds ?? [{ id: "new-registered" }], error: null };
        },
      };
    },
    insert(values: unknown) {
      calls.insert(values);
      return {
        async select() {
          return {
            data: scenario.unregisteredInsertIds ?? [{ id: "new-unregistered" }],
            error: null,
          };
        },
      };
    },
  };
  const supabase = {
    auth: {
      async getUser() {
        return { data: { user: { id: "user-1" } } };
      },
    },
    from(table: string) {
      if (table === "profiles") return profileBuilder;
      if (table === "organization_memberships") return membershipsBuilder;
      if (table === "classes") return classBuilder;
      if (table === "students") return studentsTable;
      throw new Error(`Unexpected table: ${table}`);
    },
    async rpc(name: string, input: unknown) {
      calls.rpc(name, input);
      return { data: 0, error: null };
    },
  };
  return { supabase, calls };
}

function formData(payload: string | null, selectedClassId = classId) {
  const data = new FormData();
  data.set("classId", selectedClassId);
  if (payload !== null) data.set("studentsPayload", payload);
  return data;
}

describe("importStudentsAction", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it.each([null, "", "[]", "{"])(
    "não acessa o Supabase quando o payload é inválido: %j",
    async (payload) => {
      const result = await importStudentsAction(initialStudentImportState, formData(payload));
      expect(result.status).toBe("error");
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("retorna erro amigável para turma inexistente ou sem acesso", async () => {
    const scenario = createSupabaseScenario({ classData: null });
    mocks.createClient.mockResolvedValue(scenario.supabase);

    const result = await importStudentsAction(
      initialStudentImportState,
      formData('[{"fullName":"Ana Clara"}]'),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "A turma selecionada não existe ou você não possui acesso a ela.",
    });
    expect(scenario.calls.insert).not.toHaveBeenCalled();
    expect(scenario.calls.upsert).not.toHaveBeenCalled();
  });

  it("ignora matrícula pertencente a outra turma sem alterar class_id", async () => {
    const scenario = createSupabaseScenario({
      existingStudents: [
        {
          id: "student-1",
          class_id: "bf456789-0bf5-42af-974b-64536387365b",
          registration_number: "20260001",
        },
      ],
    });
    mocks.createClient.mockResolvedValue(scenario.supabase);

    const result = await importStudentsAction(
      initialStudentImportState,
      formData('[{"fullName":"Ana Clara","registrationNumber":"20260001","callNumber":1}]'),
    );

    expect(result).toMatchObject({
      status: "success",
      importedCount: 0,
      updatedCount: 0,
      skippedCount: 1,
      conflictCount: 1,
    });
    expect(scenario.calls.update).not.toHaveBeenCalled();
    expect(scenario.calls.upsert).not.toHaveBeenCalled();
  });

  it("envia matrícula opcional e call_number corretamente", async () => {
    const scenario = createSupabaseScenario();
    mocks.createClient.mockResolvedValue(scenario.supabase);

    const result = await importStudentsAction(
      initialStudentImportState,
      formData(
        JSON.stringify([
          { fullName: "Ana Clara", registrationNumber: "001245", callNumber: 1 },
          { fullName: "Arthur Silva", callNumber: 2 },
        ]),
      ),
    );

    expect(result).toMatchObject({
      status: "success",
      importedCount: 2,
      updatedCount: 0,
      skippedCount: 0,
    });
    expect(scenario.calls.upsert).toHaveBeenCalledWith(
      [
        {
          organization_id: organizationId,
          class_id: classId,
          full_name: "Ana Clara",
          registration_number: "001245",
          call_number: 1,
        },
      ],
      expect.objectContaining({ ignoreDuplicates: true }),
    );
    expect(scenario.calls.insert).toHaveBeenCalledWith([
      {
        organization_id: organizationId,
        class_id: classId,
        full_name: "Arthur Silva",
        registration_number: null,
        call_number: 2,
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/alunos");
    expect(scenario.calls.rpc).toHaveBeenCalledWith("ensure_missing_answer_sheets_for_class", {
      p_organization_id: organizationId,
      p_class_id: classId,
    });
  });
});
