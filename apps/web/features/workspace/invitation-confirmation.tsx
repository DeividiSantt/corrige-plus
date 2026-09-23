"use client";

import { useActionState } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { acceptSchoolInvitationFormAction, type AcceptSchoolInvitationState } from "@/features/workspace/school-actions";

const initialState: AcceptSchoolInvitationState = { status: "idle" };

export function InvitationConfirmation({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptSchoolInvitationFormAction, initialState);
  return <main className="mx-auto flex min-h-dvh max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-border bg-background p-6 sm:p-8"><CheckCircleIcon size={32} className="text-success" weight="fill" aria-hidden="true" /><p className="mt-5 text-sm font-semibold text-primary">Convite para instituição</p><h1 className="mt-1 text-2xl font-bold">Confirme sua entrada</h1><p className="mt-3 text-muted-foreground">Ao confirmar, esta instituição será adicionada à sua conta. Seu espaço pessoal continuará separado.</p>{state.message && <div role="alert" className="mt-5 flex gap-3 rounded-lg bg-danger-soft p-3 text-sm"><WarningCircleIcon size={18} className="mt-0.5 shrink-0 text-danger" weight="fill" /><p>{state.message}</p></div>}<form action={formAction} className="mt-6"><input type="hidden" name="token" value={token} /><Button type="submit" className="w-full">Confirmar entrada na instituição</Button></form></section></main>;
}
