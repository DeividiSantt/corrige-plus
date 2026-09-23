"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resendConfirmationAction,
  type AuthActionState,
} from "@/features/auth/actions";
import { resendButtonLabel } from "@/features/auth/helpers";

const initialState: AuthActionState = { status: "idle" };

function ResendButton({ cooldown }: { cooldown: number }) {
  const { pending } = useFormStatus();
  const disabled = pending || cooldown > 0;
  const label = resendButtonLabel(pending, cooldown);

  return (
    <Button
      type="submit"
      variant="secondary"
      className="w-full"
      disabled={disabled}
      aria-disabled={disabled}
    >
      <EnvelopeSimpleIcon aria-hidden="true" />
      {label}
    </Button>
  );
}

export function ResendConfirmationForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [state, formAction] = useActionState(
    async (previousState: AuthActionState, formData: FormData) => {
      const nextState = await resendConfirmationAction(previousState, formData);
      if (nextState.cooldownSeconds) setCooldown(nextState.cooldownSeconds);
      return nextState;
    },
    initialState,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (!isOpen) {
    return (
      <div className="mt-5 text-center text-sm">
        <span className="text-muted-foreground">Ainda não confirmou a conta? </span>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="min-h-11 font-semibold text-primary hover:underline"
        >
          Reenviar o e-mail
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-5 space-y-4 rounded-xl bg-surface p-4" noValidate>
      <div>
        <h2 className="font-semibold">Reenviar confirmação</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe o e-mail usado no cadastro. O link pode levar alguns minutos para chegar.
        </p>
      </div>

      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`text-sm font-medium ${
            state.status === "error" ? "text-danger" : "text-success"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="resend-email">E-mail</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="professor@escola.com.br"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "resend-email-error" : undefined}
        />
        {state.fieldErrors?.email?.[0] && (
          <p id="resend-email-error" className="text-sm font-medium text-danger">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <ResendButton cooldown={cooldown} />
    </form>
  );
}
