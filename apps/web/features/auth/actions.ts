"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { productConfig } from "@corrige-plus/config";
import { getAppOrigin } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  AUTH_MESSAGES,
  authErrorMessage,
  classifyLoginError,
  loginErrorMessage,
  safeNext,
} from "@/features/auth/helpers";
import {
  loginSchema,
  recoverSchema,
  resendSchema,
  signupSchema,
  updatePasswordSchema,
} from "@/features/auth/validation";

export type AuthActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  cooldownSeconds?: number;
};

function valuesFrom(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

function validationError(error: z.ZodError): AuthActionState {
  return {
    status: "error",
    message: "Confira os campos destacados.",
    fieldErrors: z.flattenError(error).fieldErrors,
  };
}

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const requestId = crypto.randomUUID().slice(0, 12);
  const log = (stage: string, result: string, extra: Record<string, unknown> = {}) => {
    if (process.env.NODE_ENV === "development") console.info("[auth-login]", { request_id: requestId, stage, result, ...extra });
  };
  if (!(formData instanceof FormData)) {
    log("form_received", "failed", { form_data_valid: false });
    console.error("[auth] loginAction recebeu FormData invÃ¡lido");
    return {
      status: "error",
      message: "NÃ£o foi possÃ­vel enviar o formulÃ¡rio. Atualize a pÃ¡gina e tente novamente.",
    };
  }
  log("form_received", "ok", { form_data_valid: true });
  const parsed = loginSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) {
    log("validation", "failed", { field_count: Object.keys(parsed.error.flatten().fieldErrors).length });
    return validationError(parsed.error);
  }
  log("validation", "passed");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
    log("create_supabase_client", "succeeded");
  } catch (error) {
    log("create_supabase_client", "failed", { error_type: error instanceof Error ? error.name : "unknown" });
    return { status: "error", message: loginErrorMessage("service_unavailable") };
  }
  let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    signInResult = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    log("sign_in", signInResult.error ? "failed" : "succeeded", {
      error_code: signInResult.error?.code,
      error_status: signInResult.error?.status,
      user_present: Boolean(signInResult.data.user),
      session_present: Boolean(signInResult.data.session),
    });
  } catch (error) {
    const kind = classifyLoginError(error);
    log("sign_in", "failed", {
      error_kind: kind,
      error_type: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return { status: "error", message: loginErrorMessage(kind) };
  }
  const { error } = signInResult;

  if (error) {
    const kind = classifyLoginError(error);
    log("sign_in", "failed", { error_code: error.code, error_status: error.status, error_kind: kind });
    return { status: "error", message: loginErrorMessage(kind) };
    /* legacy mapping retained for reference only:
    const mappedMessage = authErrorMessage(error);
    const message =
      mappedMessage === "Não foi possível concluir a autenticação. Verifique os dados e tente novamente."
        ? "E-mail ou senha incorretos."
        : mappedMessage;
    return { status: "error", message }; */
  }
  let verified: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let verificationError: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    ({ data: verified, error: verificationError } = await supabase.auth.getUser());
  } catch (error) {
    log("verify_user", "exception", {
      error_type: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return { status: "error", message: loginErrorMessage(classifyLoginError(error)) };
  }
  log("verify_user", verificationError || !verified.user ? "failed" : "succeeded", {
    user_present: Boolean(verified.user),
    error_code: verificationError?.code,
  });
  if (verificationError || !verified.user) {
    await supabase.auth.signOut();
    return {
      status: "error",
      message: "Sua conta foi autenticada, mas nÃ£o foi possÃ­vel confirmar a sessÃ£o. Tente novamente.",
    };
  }

  let profile: { id: string } | null = null;
  let profileError: { code?: string } | null = null;
  try {
    const result = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", verified.user.id)
      .maybeSingle();
    profile = result.data;
    profileError = result.error;
  } catch (error) {
    log("load_profile", "exception", {
      error_type: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return { status: "error", message: AUTH_MESSAGES.profileLoadFailed };
  }
  log("load_profile", profileError ? "failed" : profile ? "succeeded" : "missing", {
    profile_found: Boolean(profile),
    profile_error_code: profileError?.code,
  });
  if (profileError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth] profile_lookup_failed", {
        stage: "login_profile_lookup",
        code: profileError.code,
      });
    }
    await supabase.auth.signOut();
    return { status: "error", message: AUTH_MESSAGES.profileLoadFailed };
  }
  if (!profile) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth] authenticated_user_profile_missing", {
        stage: "login_profile_lookup",
        code: "profile_not_found",
      });
    }
    await supabase.auth.signOut();
    return { status: "error", message: AUTH_MESSAGES.profileMissing };
  }

  const nextPath = safeNext(parsed.data.next);
  log("redirect", "started", { next_is_internal: true });
  redirect(nextPath);
}

export async function signupAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signupSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) return validationError(parsed.error);

  const appUrl = getAppOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl}/auth/confirm?next=${encodeURIComponent(productConfig.routes.home)}`,
      data: {
        full_name: parsed.data.fullName,
        organization_name: parsed.data.organizationName,
      },
    },
  });

  if (error) return { status: "error", message: authErrorMessage(error) };
  if (data.user && data.user.identities?.length === 0) {
    return { status: "error", message: "Já existe uma conta com este e-mail." };
  }
  if (data.session) redirect(productConfig.routes.home);

  return {
    status: "success",
    message: AUTH_MESSAGES.signupPending,
  };
}

export async function resendConfirmationAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resendSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${getAppOrigin()}/auth/confirm?next=${encodeURIComponent(productConfig.routes.home)}`,
    },
  });

  if (error) {
    return {
      status: "error",
      message: authErrorMessage(error),
      cooldownSeconds: error.status === 429 ? 60 : undefined,
    };
  }

  return {
    status: "success",
    message: AUTH_MESSAGES.resendRequested,
    cooldownSeconds: 60,
  };
}

export async function recoverPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = recoverSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) return validationError(parsed.error);

  const appUrl = getAppOrigin();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/confirm?next=/atualizar-senha`,
  });

  return {
    status: "success",
    message: "Se existir uma conta com este e-mail, enviaremos as instruções de recuperação.",
  };
}

export async function updatePasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse(valuesFrom(formData));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };

  return { status: "success", message: "Senha atualizada. Você já pode continuar." };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(productConfig.routes.login);
}
