"use client";

import { useActionState } from "react";
import { EnvelopeSimpleIcon, PaperPlaneTiltIcon, UserPlusIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteTeacherAction, type SchoolInvitationActionState } from "@/features/workspace/school-actions";

const initialState: SchoolInvitationActionState = { status: "idle" };

export function SchoolTeamManager() {
  const [state, formAction] = useActionState(inviteTeacherAction, initialState);

  return (
    <section className="rounded-xl border border-border bg-background p-5 sm:p-6" aria-labelledby="invite-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <UserPlusIcon size={20} weight="bold" aria-hidden="true" />
        </span>
        <div>
          <h2 id="invite-title" className="text-lg font-bold">Convidar professor</h2>
          <p className="mt-1 text-sm text-muted-foreground">A pessoa receberá um e-mail para criar o acesso já vinculado a esta escola.</p>
        </div>
      </div>

      {state.message && (
        <div
          role={state.status === "error" ? "alert" : "status"}
          className={`mt-5 flex gap-3 rounded-lg p-3 text-sm ${state.status === "error" ? "bg-danger-soft" : "bg-success-soft"}`}
        >
          {state.status === "error" ? <WarningCircleIcon className="mt-0.5 shrink-0 text-danger" size={18} weight="fill" /> : <EnvelopeSimpleIcon className="mt-0.5 shrink-0 text-success" size={18} weight="fill" />}
          <p>{state.message}</p>
        </div>
      )}

      <form action={formAction} className="mt-5 grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="teacherName">Nome completo</Label>
          <Input id="teacherName" name="fullName" autoComplete="name" placeholder="Nome do professor" aria-invalid={Boolean(state.fieldErrors?.fullName)} />
          {state.fieldErrors?.fullName?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.fullName[0]}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="teacherEmail">E-mail</Label>
          <Input id="teacherEmail" name="email" type="email" inputMode="email" autoComplete="email" placeholder="professor@escola.com.br" aria-invalid={Boolean(state.fieldErrors?.email)} />
          {state.fieldErrors?.email?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.email[0]}</p>}
        </div>
        <Button type="submit" className="w-full">
          <PaperPlaneTiltIcon weight="bold" aria-hidden="true" />
          Enviar convite
        </Button>
      </form>
    </section>
  );
}
