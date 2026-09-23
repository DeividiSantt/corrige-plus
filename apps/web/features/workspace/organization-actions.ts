"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_ORGANIZATION_COOKIE, workspaceData } from "@/features/workspace/data";

const organizationIdSchema = z.string().uuid();
const createSchoolSchema = z.object({ name: z.string().trim().min(2, "Informe o nome da instituição.").max(160) });

export type CreateSchoolState = { status: "idle" | "error" | "success"; message?: string; fieldErrors?: Record<string, string[]> };

export async function selectOrganizationAction(formData: FormData) {
  const organizationId = organizationIdSchema.parse(formData.get("organizationId"));
  const { supabase, userId } = await workspaceData();
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) throw new Error("Você não possui acesso a esta instituição.");
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function createSchoolAction(_state: CreateSchoolState, formData: FormData): Promise<CreateSchoolState> {
  const parsed = createSchoolSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Confira o nome informado.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { userId, profile } = await workspaceData();
  let admin;
  try { admin = createAdminClient(); } catch { return { status: "error", message: "Não foi possível configurar a criação da instituição no servidor." }; }
  const slugBase = parsed.data.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "escola";
  const { data: school, error } = await admin
    .from("organizations")
    .insert({ name: parsed.data.name, slug: `${slugBase}-${crypto.randomUUID().slice(0, 8)}`, kind: "school", owner_user_id: userId })
    .select("id")
    .single();
  if (error || !school) return { status: "error", message: "Não foi possível criar a instituição. Tente novamente." };
  const { error: membershipError } = await admin.from("organization_memberships").insert({ organization_id: school.id, user_id: userId, full_name: profile.full_name, role: "organization_admin" });
  if (membershipError) { await admin.from("organizations").delete().eq("id", school.id); return { status: "error", message: "Não foi possível concluir a criação da instituição." }; }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, school.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/escola");
}
