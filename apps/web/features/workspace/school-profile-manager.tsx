"use client";

import { useActionState } from "react";
import { BuildingOfficeIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSchoolProfileAction, type SchoolProfileActionState } from "@/features/workspace/school-actions";

const initialState: SchoolProfileActionState = { status: "idle" };

type SchoolProfileManagerProps = {
  school: { name: string; city: string | null; contactEmail: string | null };
  needsSetup: boolean;
};

export function SchoolProfileManager({ school, needsSetup }: SchoolProfileManagerProps) {
  const [state, formAction] = useActionState(updateSchoolProfileAction, initialState);

  return (
    <section className="rounded-xl border border-border bg-background p-5 sm:p-6" aria-labelledby="school-profile-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <BuildingOfficeIcon size={21} weight="bold" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold text-primary">{needsSetup ? "Primeiro passo" : "Dados da instituição"}</p>
          <h2 id="school-profile-title" className="mt-1 text-lg font-bold">{needsSetup ? "Crie sua instituição" : "Atualize os dados da escola"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsSetup
              ? "Cadastre os dados que identificam a sua escola. Depois, você poderá convidar professores." 
              : "Esses dados identificam a escola para a equipe e os convites."}
          </p>
        </div>
      </div>

      {state.message && (
        <div role={state.status === "error" ? "alert" : "status"} className={`mt-5 flex gap-3 rounded-lg p-3 text-sm ${state.status === "error" ? "bg-danger-soft" : "bg-success-soft"}`}>
          {state.status === "error" ? <WarningCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-danger" /> : <CheckCircleIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-success" />}
          <p>{state.message}</p>
        </div>
      )}

      <form action={formAction} className="mt-5 grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="schoolName">Nome da instituição</Label>
          <Input id="schoolName" name="name" defaultValue={needsSetup ? "" : school.name} placeholder="Ex.: Escola Municipal Horizonte" aria-invalid={Boolean(state.fieldErrors?.name)} />
          {state.fieldErrors?.name?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.name[0]}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="schoolCity">Cidade <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="schoolCity" name="city" defaultValue={school.city || ""} placeholder="Ex.: Rio Branco" aria-invalid={Boolean(state.fieldErrors?.city)} />
            {state.fieldErrors?.city?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.city[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="schoolEmail">E-mail de contato <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="schoolEmail" name="contactEmail" type="email" defaultValue={school.contactEmail || ""} placeholder="contato@escola.com.br" aria-invalid={Boolean(state.fieldErrors?.contactEmail)} />
            {state.fieldErrors?.contactEmail?.[0] && <p className="text-sm font-medium text-danger">{state.fieldErrors.contactEmail[0]}</p>}
          </div>
        </div>
        <Button type="submit" className="w-full">{needsSetup ? "Criar instituição" : "Salvar alterações"}</Button>
      </form>
    </section>
  );
}
