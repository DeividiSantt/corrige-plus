import Link from "next/link";
import type { Route } from "next";

export type SetupStep = { label: string; detail: string; href: string; state: "done" | "current" | "locked" };

export function SetupStepper({ steps }: { steps: SetupStep[] }) {
  const current = Math.max(0, steps.findIndex((step) => step.state === "current"));
  return <section aria-label="Progresso da configuração" className="rounded-xl border border-border bg-background p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-primary">Configurar avaliação</p><h2 className="mt-1 text-lg font-bold">Próximo passo sempre visível</h2></div><span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold">Etapa {current + 1} de {steps.length}</span></div><ol className="mt-6 grid gap-2 md:grid-cols-7">{steps.map((step, index) => { const content = <span className={`block rounded-lg border p-3 ${step.state === "current" ? "border-primary bg-primary-soft" : "border-border"}`} aria-current={step.state === "current" ? "step" : undefined}><span className="flex items-center gap-2 text-sm font-semibold"><span className="grid size-6 place-items-center rounded-full bg-surface text-xs">{step.state === "done" ? "✓" : index + 1}</span>{step.label}</span><span className="mt-1 block text-xs text-muted-foreground">{step.detail}</span></span>; return <li key={step.label}>{step.state === "locked" ? content : <Link href={step.href as Route}>{content}</Link>}</li>; })}</ol></section>;
}
