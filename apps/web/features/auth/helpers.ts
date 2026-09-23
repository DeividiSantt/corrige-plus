import type { Route } from "next";
import { productConfig } from "@corrige-plus/config";

type AuthError = {
  code?: string;
  message?: string;
  status?: number;
};

export type LoginErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limit"
  | "network_error"
  | "service_unavailable"
  | "unexpected_error";

export const AUTH_MESSAGES = {
  callbackFailed: "Não foi possível confirmar este link. Solicite um novo acesso.",
  callbackExpired: "Este link de confirmação expirou. Solicite um novo acesso.",
  emailInvalid: "Digite um endereço de e-mail válido.",
  emailNotConfirmed: "Confirme seu e-mail antes de entrar.",
  emailRateLimited:
    "O serviço de confirmação atingiu temporariamente o limite de envio de e-mails. Aguarde alguns minutos antes de tentar novamente ou utilize o reenvio de confirmação.",
  invalidCredentials: "E-mail ou senha incorretos.",
  profileLoadFailed: "Não foi possível carregar seu perfil neste momento. Tente novamente.",
  profileMissing:
    "Sua conta foi autenticada, mas o perfil do professor não foi encontrado. Entre em contato com o suporte ou tente novamente.",
  resendRequested:
    "Se existir uma conta aguardando confirmação para este e-mail, um novo link será enviado.",
  signupPending:
    "Conta criada. Enviamos um link de confirmação para seu e-mail. Confirme o endereço antes de entrar.",
} as const;

const errorMessages: Record<string, string> = {
  invalid_credentials: AUTH_MESSAGES.invalidCredentials,
  email_not_confirmed: AUTH_MESSAGES.emailNotConfirmed,
  user_already_exists: "Já existe uma conta com este e-mail.",
  email_exists: "Já existe uma conta com este e-mail.",
  email_address_invalid: AUTH_MESSAGES.emailInvalid,
  weak_password: "A senha não atende aos requisitos de segurança.",
  signup_disabled: "Novos cadastros estão temporariamente indisponíveis.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  over_email_send_rate_limit: AUTH_MESSAGES.emailRateLimited,
  email_rate_limit_exceeded: AUTH_MESSAGES.emailRateLimited,
  validation_failed: "Confira os dados informados e tente novamente.",
  otp_expired: AUTH_MESSAGES.callbackExpired,
};

export function classifyLoginError(error: unknown): LoginErrorKind {
  const candidate = (error && typeof error === "object" ? error : {}) as AuthError;
  const code = candidate.code?.toLowerCase();
  const message = candidate.message?.toLowerCase() ?? "";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "email_not_confirmed";
  if (candidate.status === 429 || code?.includes("rate_limit") || message.includes("rate limit")) return "rate_limit";
  const errorName = error instanceof Error ? error.name.toLowerCase() : "";
  if (
    error instanceof TypeError ||
    errorName.includes("retryablefetch") ||
    errorName === "aborterror" ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("enotfound")
  ) return "network_error";
  if (typeof candidate.status === "number" && candidate.status >= 500) return "service_unavailable";
  return "unexpected_error";
}

export function loginErrorMessage(kind: LoginErrorKind) {
  switch (kind) {
    case "invalid_credentials": return AUTH_MESSAGES.invalidCredentials;
    case "email_not_confirmed": return AUTH_MESSAGES.emailNotConfirmed;
    case "rate_limit": return "Muitas tentativas foram realizadas. Aguarde um momento e tente novamente.";
    case "network_error": return "NÃ£o foi possÃ­vel conectar ao serviÃ§o de autenticaÃ§Ã£o. Verifique sua conexÃ£o e tente novamente.";
    case "service_unavailable": return "NÃ£o foi possÃ­vel acessar sua conta agora. Tente novamente em alguns instantes.";
    default: return "Ocorreu uma falha inesperada ao entrar. Atualize a pÃ¡gina e tente novamente.";
  }
}

export function authErrorMessage(error?: AuthError) {
  if (error?.code && errorMessages[error.code]) return errorMessages[error.code];

  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("invalid login credentials")) return AUTH_MESSAGES.invalidCredentials;
  if (message.includes("email not confirmed")) return AUTH_MESSAGES.emailNotConfirmed;
  if (message.includes("expired")) return AUTH_MESSAGES.callbackExpired;
  if (message.includes("email") && message.includes("rate limit")) return AUTH_MESSAGES.emailRateLimited;
  if (message.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }
  if (error?.status && error.status >= 500) {
    return "O serviço de autenticação está temporariamente indisponível. Tente novamente.";
  }
  return "Não foi possível concluir a autenticação. Verifique os dados e tente novamente.";
}

export function callbackErrorMessage(error?: AuthError) {
  const mapped = authErrorMessage(error);
  return mapped === AUTH_MESSAGES.callbackExpired ? mapped : AUTH_MESSAGES.callbackFailed;
}

export function safeNext(value?: string | null): Route {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return productConfig.routes.home;
  }
  return value as Route;
}

const authEntryRoutes = new Set(["/login", "/cadastro", "/recuperar-senha"]);
const authPublicRoutes = new Set([...authEntryRoutes, "/atualizar-senha"]);

export function isAuthEntryPath(path: string) {
  return authEntryRoutes.has(path);
}

export function isPublicAuthPath(path: string) {
  return path === "/" || authPublicRoutes.has(path) || path.startsWith("/auth/");
}

export function resendButtonLabel(pending: boolean, cooldown: number) {
  if (pending) return "Solicitando…";
  if (cooldown > 0) return `Tente novamente em ${cooldown}s`;
  return "Reenviar confirmação";
}
