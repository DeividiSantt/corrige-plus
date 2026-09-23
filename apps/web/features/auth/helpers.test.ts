import { describe, expect, it } from "vitest";
import {
  AUTH_MESSAGES,
  authErrorMessage,
  callbackErrorMessage,
  isAuthEntryPath,
  isPublicAuthPath,
  resendButtonLabel,
  safeNext,
} from "@/features/auth/helpers";
import { signupSchema } from "@/features/auth/validation";

describe("mensagens de autenticação", () => {
  it.each([
    ["invalid_credentials", AUTH_MESSAGES.invalidCredentials],
    ["email_not_confirmed", AUTH_MESSAGES.emailNotConfirmed],
    ["over_email_send_rate_limit", AUTH_MESSAGES.emailRateLimited],
  ])("traduz %s", (code, expected) => {
    expect(authErrorMessage({ code })).toBe(expected);
  });

  it("diferencia link expirado de callback inválido", () => {
    expect(callbackErrorMessage({ code: "otp_expired" })).toBe(AUTH_MESSAGES.callbackExpired);
    expect(callbackErrorMessage({ code: "unexpected_failure" })).toBe(AUTH_MESSAGES.callbackFailed);
  });
});

describe("validação e redirecionamento", () => {
  it("rejeita senhas diferentes no cadastro", () => {
    const result = signupSchema.safeParse({
      fullName: "Professora Teste",
      organizationName: "Escola Teste",
      email: "professora@example.org",
      password: "Senha123",
      passwordConfirmation: "Outra123",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["passwordConfirmation"]);
    }
  });

  it("impede redirecionamento para domínio externo", () => {
    expect(safeNext("//site-malicioso.example")).toBe("/dashboard");
    expect(safeNext("https://site-malicioso.example")).toBe("/dashboard");
    expect(safeNext("/dashboard/turmas")).toBe("/dashboard/turmas");
  });

  it("mantém login e cadastro públicos e dashboard protegido", () => {
    expect(isPublicAuthPath("/login")).toBe(true);
    expect(isPublicAuthPath("/cadastro")).toBe(true);
    expect(isPublicAuthPath("/auth/confirm")).toBe(true);
    expect(isPublicAuthPath("/dashboard")).toBe(false);
    expect(isAuthEntryPath("/login")).toBe(true);
    expect(isAuthEntryPath("/atualizar-senha")).toBe(false);
  });
});

describe("reenvio de confirmação", () => {
  it("informa loading, cooldown e disponibilidade", () => {
    expect(resendButtonLabel(true, 0)).toBe("Solicitando…");
    expect(resendButtonLabel(false, 60)).toBe("Tente novamente em 60s");
    expect(resendButtonLabel(false, 0)).toBe("Reenviar confirmação");
  });

  it("mantém mensagem neutra contra enumeração", () => {
    expect(AUTH_MESSAGES.resendRequested).not.toMatch(/existe uma conta confirmada/i);
    expect(AUTH_MESSAGES.resendRequested).toMatch(/se existir uma conta/i);
  });

  it("expõe mensagem específica quando o perfil está ausente", () => {
    expect(AUTH_MESSAGES.profileMissing).toMatch(/perfil do professor não foi encontrado/i);
  });

  it("diferencia falha de consulta de perfil de perfil inexistente", () => {
    expect(AUTH_MESSAGES.profileLoadFailed).toMatch(/não foi possível carregar seu perfil/i);
    expect(AUTH_MESSAGES.profileLoadFailed).not.toBe(AUTH_MESSAGES.profileMissing);
  });
});
