"use client";

import { useActionState } from "react";
import { BuildingOfficeIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSchoolAction, type CreateSchoolState } from "@/features/workspace/organization-actions";

const initialState: CreateSchoolState = { status: "idle" };

export function SchoolCreateManager() {
  const [state, formAction] = useActionState(createSchoolAction, initialState);
  return <section className="rounded-xl border border-border bg-background p-5 sm:p-6" aria-labelledby="create-school-title">
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><BuildingOfficeIcon size={21} weight="bold" aria-hidden="true" /></span><div><p className="text-sm font-semibold text-primary">Nova instituição</p><h2 id="create-school-title" className="mt-1 text-lg font-bold">Criar uma escola</h2><p className="mt-1 text-sm text-muted-foreground">Sua conta continuará com o espaço pessoal separado. Você será a coordenação desta instituição.</p></div></div>
    {state.message && <div role={state.status === "error" ? "alert" : "status"} className={`mt-5 flex gap-3 rounded-lg p-3 text-sm ${state.status === "error" ? "bg-danger-soft" : "bg-success-soft"}`}>{state.status === "error" ? <WarningCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-danger" /> : <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" />}<p>{state.message}</p></div>}
    <form action={formAction} className="mt-5 space-y-4"><div className="space-y-2"><Label htmlFor="newSchoolName">Nome da instituição</Label><Input id="newSchoolName" name="name" placeholder="Ex.: Escola Municipal Horizonte" aria-invalid={Boolean(state.fieldErrors?.name)} />{state.fieldErrors?.name?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.name[0]}</p>}</div><Button type="submit" className="w-full">Criar instituição</Button></form>
  </section>;
}
