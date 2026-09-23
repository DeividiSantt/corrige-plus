"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAppOrigin } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { workspaceData } from "@/features/workspace/data";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/features/workspace/data";

export type SchoolInvitationActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export type SchoolProfileActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const invitationSchema = z.object({
  fullName: z.string().trim().min(2, "Informe o nome do professor.").max(160),
  email: z.email("Informe um e-mail válido.").transform((value) => value.toLowerCase()),
});

const schoolProfileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da instituição.").max(160),
  city: z.string().trim().max(120, "Informe uma cidade com até 120 caracteres.").optional(),
  contactEmail: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => !value || z.email().safeParse(value).success, "Informe um e-mail válido."),
});

function validationError(error: z.ZodError): SchoolInvitationActionState {
  return {
    status: "error",
    message: "Confira os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

function schoolProfileValidationError(error: z.ZodError): SchoolProfileActionState {
  return {
    status: "error",
    message: "Confira os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

export async function updateSchoolProfileAction(
  _previousState: SchoolProfileActionState,
  formData: FormData,
): Promise<SchoolProfileActionState> {
  const parsed = schoolProfileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return schoolProfileValidationError(parsed.error);

  const { supabase, organizationId, profile } = await workspaceData();
  if (profile.role !== "organization_admin" && profile.role !== "platform_admin") {
    return { status: "error", message: "Somente a coordenação pode cadastrar os dados da instituição." };
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      city: parsed.data.city || null,
      contact_email: parsed.data.contactEmail || null,
    })
    .eq("id", organizationId);

  if (error) {
    return { status: "error", message: "Não foi possível salvar os dados da instituição. Tente novamente." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/escola");
  return { status: "success", message: "Instituição cadastrada com sucesso." };
}

export async function inviteTeacherAction(
  _previousState: SchoolInvitationActionState,
  formData: FormData,
): Promise<SchoolInvitationActionState> {
  const parsed = invitationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return validationError(parsed.error);

  const { organizationId, profile, userId } = await workspaceData();
  if (profile.role !== "organization_admin" && profile.role !== "platform_admin") {
    return { status: "error", message: "Somente a coordenação da escola pode convidar professores." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      status: "error",
      message: "O envio de convites ainda não foi configurado. Adicione a chave administrativa do Supabase no servidor.",
    };
  }

  const token = crypto.randomUUID();
  const { error: invitationError } = await admin.from("school_invitations").insert({
    organization_id: organizationId,
    email: parsed.data.email,
    full_name: parsed.data.fullName,
    invited_by: userId,
    token,
  });

  if (invitationError) {
    if (invitationError.code === "23505") {
      return { status: "error", message: "Já existe um convite pendente para este e-mail." };
    }
    return { status: "error", message: "Não foi possível preparar o convite. Tente novamente." };
  }

  const invitationPath = `/convite?token=${encodeURIComponent(token)}`;
  const redirectTo = `${getAppOrigin()}/auth/confirm?next=${encodeURIComponent(invitationPath)}`;
  const authClient = await createClient();
  const { error: existingAccountError } = await authClient.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });

  if (!existingAccountError) {
    revalidatePath("/dashboard/escola");
    return { status: "success", message: `Convite enviado para ${parsed.data.email}. A pessoa só precisa confirmar a entrada na instituição.` };
  }

  const { error: emailError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo,
    data: { full_name: parsed.data.fullName },
  });

  if (emailError) {
    await admin.from("school_invitations").delete().eq("token", token);
    return { status: "error", message: "Não foi possível enviar o e-mail de convite. Confira a configuração de e-mail do Supabase." };
  }

  revalidatePath("/dashboard/escola");
  return { status: "success", message: `Convite enviado para ${parsed.data.email}.` };
}

export async function acceptSchoolInvitationAction(token: string) {
  const tokenCheck = z.string().uuid().safeParse(token);
  if (!tokenCheck.success) return { status: "error" as const, message: "Convite inválido." };
  const { userId } = await workspaceData();
  let admin;
  try { admin = createAdminClient(); } catch { return { status: "error" as const, message: "Não foi possível confirmar o convite no servidor." }; }
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email?.toLowerCase();
  if (!email) return { status: "error" as const, message: "Não foi possível identificar a conta convidada." };
  const { data: invitation } = await admin
    .from("school_invitations")
    .select("id,organization_id,full_name,email,status,expires_at")
    .eq("token", tokenCheck.data)
    .maybeSingle();
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) < new Date() || invitation.email.toLowerCase() !== email) {
    return { status: "error" as const, message: "Este convite não está mais disponível para esta conta." };
  }
  const { error: membershipError } = await admin.from("organization_memberships").upsert(
    { organization_id: invitation.organization_id, user_id: userId, full_name: invitation.full_name, role: "teacher" },
    { onConflict: "organization_id,user_id" },
  );
  if (membershipError) return { status: "error" as const, message: "Não foi possível vincular sua conta à instituição." };
  await admin.from("school_invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invitation.id);
  return { status: "success" as const, organizationId: invitation.organization_id };
}

export type AcceptSchoolInvitationState = { status: "idle" | "error"; message?: string };

export async function acceptSchoolInvitationFormAction(_state: AcceptSchoolInvitationState, formData: FormData): Promise<AcceptSchoolInvitationState> {
  const result = await acceptSchoolInvitationAction(String(formData.get("token") || ""));
  if (result.status === "error") return result;
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, result.organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
