"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRightIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthActionState } from "@/features/auth/actions";
import { ResendConfirmationForm } from "@/features/auth/resend-confirmation-form";

type AuthMode = "login" | "signup" | "recover" | "update-password";
type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;
const initialAuthState: AuthActionState = { status: "idle" };

const content: Record<AuthMode, { title: string; description: string; submit: string }> = {
  login: {
    title: "Entre na sua conta",
    description: "Continue de onde parou com suas turmas e avaliações.",
    submit: "Entrar",
  },
  signup: {
    title: "Crie sua conta",
    description: "Cadastre sua escola e convide os professores depois.",
    submit: "Criar conta",
  },
  recover: {
    title: "Recupere seu acesso",
    description: "Informe seu e-mail para receber as instruções de recuperação.",
    submit: "Enviar instruções",
  },
  "update-password": {
    title: "Defina uma nova senha",
    description: "Escolha uma senha segura para proteger sua conta.",
    submit: "Salvar nova senha",
  },
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="mt-2 w-full" disabled={pending} aria-disabled={pending}>
      {pending ? "Aguarde…" : label}
      {!pending && <ArrowRightIcon weight="bold" aria-hidden="true" />}
    </Button>
  );
}

function FieldError({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="text-sm font-medium text-danger">
      {errors[0]}
    </p>
  );
}

export function AuthForm({
  mode,
  action,
  next,
  initialMessage,
}: {
  mode: AuthMode;
  action: AuthAction;
  next?: string;
  initialMessage?: string;
}) {
  const [state, formAction] = useActionState(action, initialAuthState);
  const labels = content[mode];
  const isSuccess = state.status === "success";

  return (
    <div className="w-full max-w-md">
      <div>
        <h1 className="text-balance text-3xl font-bold tracking-[-0.03em]">{labels.title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{labels.description}</p>
      </div>

      {(state.message || initialMessage) && (
        <div
          role={state.status === "error" || initialMessage ? "alert" : "status"}
          className={`mt-6 flex gap-3 rounded-xl p-4 text-sm ${
            state.status === "error" || initialMessage
              ? "bg-danger-soft text-foreground"
              : "bg-success-soft text-foreground"
          }`}
        >
          {state.status === "error" || initialMessage ? (
            <WarningCircleIcon className="mt-0.5 shrink-0 text-danger" size={20} weight="fill" aria-hidden="true" />
          ) : (
            <CheckCircleIcon className="mt-0.5 shrink-0 text-success" size={20} weight="fill" aria-hidden="true" />
          )}
          <p>{state.message || initialMessage}</p>
        </div>
      )}

      {!isSuccess && (
        <form action={formAction} className="mt-7 space-y-5" noValidate>
          {next && <input type="hidden" name="next" value={next} />}

          {mode === "signup" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  placeholder="Como devemos chamar você?"
                  aria-invalid={Boolean(state.fieldErrors?.fullName)}
                  aria-describedby={state.fieldErrors?.fullName ? "fullName-error" : undefined}
                />
                <FieldError id="fullName-error" errors={state.fieldErrors?.fullName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organizationName">Escola</Label>
                <Input
                  id="organizationName"
                  name="organizationName"
                  autoComplete="organization"
                  placeholder="Nome da escola ou instituição"
                  aria-invalid={Boolean(state.fieldErrors?.organizationName)}
                  aria-describedby={state.fieldErrors?.organizationName ? "organizationName-error" : undefined}
                />
                <FieldError id="organizationName-error" errors={state.fieldErrors?.organizationName} />
              </div>
            </>
          )}

          {mode !== "update-password" && (
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="professor@escola.com.br"
                aria-invalid={Boolean(state.fieldErrors?.email)}
                aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
              />
              <FieldError id="email-error" errors={state.fieldErrors?.email} />
            </div>
          )}

          {(mode === "login" || mode === "signup" || mode === "update-password") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="password">Senha</Label>
                {mode === "login" && (
                  <Link href="/recuperar-senha" className="text-sm font-semibold text-primary hover:underline">
                    Esqueci minha senha
                  </Link>
                )}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "login" ? "Sua senha" : "Mínimo de 8 caracteres"}
                aria-invalid={Boolean(state.fieldErrors?.password)}
                aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
              />
              <FieldError id="password-error" errors={state.fieldErrors?.password} />
            </div>
          )}

          {(mode === "signup" || mode === "update-password") && (
            <div className="space-y-2">
              <Label htmlFor="passwordConfirmation">
                {mode === "signup" ? "Confirme a senha" : "Confirme a nova senha"}
              </Label>
              <Input
                id="passwordConfirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                placeholder={mode === "signup" ? "Repita a senha" : "Repita a nova senha"}
                aria-invalid={Boolean(state.fieldErrors?.passwordConfirmation)}
                aria-describedby={
                  state.fieldErrors?.passwordConfirmation ? "passwordConfirmation-error" : undefined
                }
              />
              <FieldError
                id="passwordConfirmation-error"
                errors={state.fieldErrors?.passwordConfirmation}
              />
            </div>
          )}

          <SubmitButton label={labels.submit} />
        </form>
      )}

      <div className="mt-7 border-t border-border pt-6 text-center text-sm text-muted-foreground">
        {mode === "login" && (
          <>
            <p>
              Ainda não tem conta?{" "}
              <Link href="/cadastro" className="font-semibold text-primary hover:underline">Criar conta</Link>
            </p>
            <ResendConfirmationForm />
          </>
        )}
        {mode === "signup" && (
          <p>
            Já tem uma conta?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">Entrar</Link>
          </p>
        )}
        {(mode === "recover" || mode === "update-password") && (
          <Link href="/login" className="font-semibold text-primary hover:underline">Voltar para o login</Link>
        )}
      </div>
    </div>
  );
}
