import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRightIcon,
  BooksIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ClockIcon,
  BuildingIcon,
  GraduationCapIcon,
  ScanIcon,
  SignOutIcon,
  StudentIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { productConfig } from "@corrige-plus/config";
import { logoutAction } from "@/features/auth/actions";
import { workspaceData } from "@/features/workspace/data";
import { OrganizationSwitcher } from "@/features/workspace/organization-switcher";

const navigation = [
  { label: "Turmas", href: "/dashboard/turmas", icon: BooksIcon },
  { label: "Alunos", href: "/dashboard/alunos", icon: StudentIcon },
  { label: "Avaliações", href: "/dashboard/avaliacoes", icon: ClipboardTextIcon },
  { label: "Corrigir provas", href: "/dashboard/corrigir-provas", icon: ScanIcon },
  { label: "Exportações", href: "/dashboard/exportacoes" as Route, icon: ClipboardTextIcon },
  { label: "Histórico", href: "/dashboard/historico-cartoes" as Route, icon: ClipboardTextIcon },
  { label: "Revisão", href: "/dashboard/revisao", icon: WarningCircleIcon },
  { label: "Teste de correção", href: "/dashboard/teste-correcao", icon: ScanIcon },
] as const;

const actions = [
  {
    label: "Nova turma",
    detail: "Organize alunos e disciplina",
    href: "/dashboard/turmas",
    icon: GraduationCapIcon,
  },
  {
    label: "Importar alunos",
    detail: "CSV ou planilha XLSX",
    href: "/dashboard/alunos",
    icon: UploadSimpleIcon,
  },
  {
    label: "Nova avaliação",
    detail: "Crie prova, gabarito e cartões",
    href: "/dashboard/avaliacoes",
    icon: ClipboardTextIcon,
  },
] as const;

export default async function DashboardPage() {
  const { supabase, organizationId, profile: currentProfile, memberships } = await workspaceData();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  const [
    { data: profile },
    { count: classCount },
    { count: studentCount },
    { count: examCount },
    { count: cardCount },
    { count: processedCount },
    { count: reviewCount },
    { data: recentExams },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", userId).single(),
    supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("exams")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase
      .from("answer_sheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("deleted_at", null),
    supabase
      .from("answer_sheets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["corrected", "confirmed"]),
    supabase
      .from("review_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending"),
    supabase
      .from("exams")
      .select("id,title,subject,status,created_at,classes(name)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const teacherName = String(profile?.full_name || auth.user?.email?.split("@")[0] || "Professor");
  const isSchoolAdmin = currentProfile.role === "organization_admin" || currentProfile.role === "platform_admin";
  const navigationWithSchool = [
    { label: isSchoolAdmin ? "Escola e equipe" : "Minha escola", href: "/dashboard/escola" as Route, icon: BuildingIcon },
    ...navigation,
  ];
  const firstName = teacherName.split(/\s+/)[0];
  const initials = teacherName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  const metrics = [
    { label: "Turmas", value: classCount ?? 0, detail: "Turmas ativas", icon: BooksIcon },
    { label: "Alunos", value: studentCount ?? 0, detail: "Alunos ativos", icon: StudentIcon },
    {
      label: "Avaliações",
      value: examCount ?? 0,
      detail: "Criadas até agora",
      icon: ClipboardTextIcon,
    },
    {
      label: "Cartões processados",
      value: processedCount ?? 0,
      detail: "Corrigidos ou confirmados",
      icon: ScanIcon,
    },
  ];

  const flow = [
    {
      label: "Criar turma",
      detail: "Organize sua classe",
      href: "/dashboard/turmas" as Route,
      action: "Criar turma",
      complete: Boolean(classCount),
      available: true,
    },
    {
      label: "Adicionar alunos",
      detail: "Cadastre ou importe",
      href: "/dashboard/alunos" as Route,
      action: "Adicionar alunos",
      complete: Boolean(studentCount),
      available: Boolean(classCount),
    },
    {
      label: "Criar avaliação",
      detail: "Defina o gabarito",
      href: "/dashboard/avaliacoes" as Route,
      action: "Criar avaliação",
      complete: Boolean(examCount),
      available: Boolean(studentCount),
    },
    {
      label: "Gerar cartões",
      detail: "Prepare a impressão",
      href: "/dashboard/avaliacoes" as Route,
      action: "Gerar cartões",
      complete: Boolean(cardCount),
      available: Boolean(examCount),
    },
    {
      label: "Enviar fotos",
      detail: "Corrija os cartões",
      href: "/dashboard/corrigir-provas" as Route,
      action: "Enviar fotos",
      complete: Boolean(processedCount || reviewCount),
      available: Boolean(cardCount),
    },
    {
      label: "Conferir resultados",
      detail: "Revise e exporte",
      href: reviewCount ? ("/dashboard/revisao" as Route) : ("/dashboard/exportacoes" as Route),
      action: reviewCount ? "Abrir revisão" : "Ver resultados",
      complete: Boolean(processedCount) && !reviewCount,
      available: Boolean(processedCount || reviewCount),
    },
  ];
    const firstIncompleteFlowIndex = flow.findIndex((step) => !step.complete);
    const currentFlowIndex = firstIncompleteFlowIndex === -1 ? flow.length - 1 : firstIncompleteFlowIndex;
  const currentFlow = flow[currentFlowIndex] || flow[flow.length - 1];
  const completedFlowCount = flow.filter((step) => step.complete).length;

  const nextStep: {
    title: string;
    description: string;
    href: Route;
    action: string;
  } =
    !classCount
      ? {
          title: "Crie sua primeira turma",
          description: "A turma organiza os alunos e libera a criação das avaliações.",
          href: "/dashboard/turmas",
          action: "Criar turma",
        }
      : !studentCount
        ? {
            title: "Adicione os alunos",
            description: "Importe a lista da turma para gerar cartões identificados.",
            href: "/dashboard/alunos",
            action: "Importar alunos",
          }
        : !examCount
          ? {
              title: "Prepare a primeira avaliação",
              description: "Informe o gabarito para gerar os cartões-resposta da turma.",
              href: "/dashboard/avaliacoes",
              action: "Criar avaliação",
            }
          : {
              title: "Tudo pronto para corrigir",
              description: "Selecione uma avaliação e envie as fotos dos cartões preenchidos.",
              href: "/dashboard/corrigir-provas",
              action: "Corrigir provas",
            };

  return (
    <div className="min-h-dvh bg-surface text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-background px-5 py-6 lg:flex lg:flex-col">
        <Link
          href="/dashboard"
          className="flex items-center gap-3"
          aria-label={`${productConfig.name}, início`}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
            <CheckCircleIcon size={22} weight="fill" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-[-0.02em]">{productConfig.name}</span>
        </Link>

        <nav className="mt-10 space-y-1" aria-label="Navegação principal">
          <Link
            href="/dashboard"
            className="flex min-h-11 items-center gap-3 rounded-lg bg-primary-soft px-3 font-semibold text-primary"
          >
            <ClipboardTextIcon size={19} weight="fill" aria-hidden="true" />
            Visão geral
          </Link>
          {navigationWithSchool.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-xl bg-surface p-4">
          <p className="text-sm font-semibold">Ambiente conectado</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Dados protegidos pelo Supabase e processamento local disponível.
          </p>
        </div>
      </aside>

      <main className="lg:pl-64">
        <header className="border-b border-border bg-background px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-3 lg:hidden">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
                <CheckCircleIcon size={22} weight="fill" aria-hidden="true" />
              </span>
              <span className="font-bold">{productConfig.name}</span>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <OrganizationSwitcher memberships={memberships} activeOrganizationId={organizationId} />
            <span className="hidden text-right sm:block">
              <span className="block text-sm font-semibold">{teacherName}</span>
                <span className="block text-xs text-muted-foreground">{isSchoolAdmin ? "Coordenação" : "Professor"}</span>
              </span>
              <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                {initials}
              </span>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <SignOutIcon size={18} weight="bold" aria-hidden="true" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        <nav
          aria-label="Atalhos no celular"
          className="flex gap-2 overflow-x-auto border-b border-border bg-background px-5 py-3 lg:hidden"
        >
          {navigationWithSchool.slice(0, 6).map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-full bg-surface px-3 py-2 text-sm font-semibold text-foreground"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/dashboard/historico-cartoes"
            className="shrink-0 rounded-full bg-primary-soft px-3 py-2 text-sm font-semibold text-primary"
          >
            Histórico de cartões
          </Link>
        </nav>

        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold capitalize text-primary">{today}</p>
              <h1 className="mt-2 text-balance text-3xl font-bold tracking-[-0.03em]">
                Olá, {firstName}. Vamos organizar as próximas correções?
              </h1>
              <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">
                Acompanhe suas turmas e avance pelo fluxo sem perder o próximo passo.
              </p>
            </div>
            <Link
              href="/dashboard/corrigir-provas"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              <ScanIcon size={18} weight="bold" aria-hidden="true" />
              Corrigir provas
            </Link>
            <Link
              href="/dashboard/historico-cartoes"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
            >
              Histórico de cartões
            </Link>
            <Link
              href="/dashboard/escola"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary-soft px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft/70"
            >
              <BuildingIcon size={18} weight="bold" aria-hidden="true" />
              {isSchoolAdmin ? "Escola e equipe" : "Minha escola"}
            </Link>
          </div>

          <section
            aria-labelledby="fluxo-title"
            className="mt-8 overflow-hidden rounded-2xl border border-primary/20 bg-primary-soft"
          >
            <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                    Seu caminho de correção
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {completedFlowCount} de {flow.length} etapas concluídas
                  </span>
                </div>
                <h2 id="fluxo-title" className="mt-4 text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
                  {completedFlowCount === flow.length ? "Tudo pronto para uma nova correção." : `Próximo passo: ${currentFlow.label.toLowerCase()}`}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/75 sm:text-base">
                  {completedFlowCount === flow.length
                    ? "Seu fluxo está completo. Consulte os resultados ou comece uma nova avaliação."
                    : "Siga a ordem abaixo. Cada etapa libera a próxima e o CORRIGE+ mantém seu progresso salvo."}
                </p>
              </div>
              <Link
                href={currentFlow.href}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                {completedFlowCount === flow.length ? "Ver resultados" : currentFlow.action}
                <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
              </Link>
            </div>
            <ol className="grid border-t border-primary/15 bg-background/55 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-label="Etapas do fluxo principal">
              {flow.map((step, index) => {
                const isCurrent = index === currentFlowIndex && completedFlowCount < flow.length;
                const content = (
                  <span className={`flex min-h-24 flex-col justify-between gap-3 border-b border-primary/10 p-4 transition-colors xl:border-b-0 xl:border-r last:border-r-0 ${isCurrent ? "bg-white" : "hover:bg-white/70"}`}>
                    <span className="flex items-center gap-2">
                      <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${step.complete ? "bg-success-soft text-success" : isCurrent ? "bg-primary text-white" : "bg-surface-strong text-muted-foreground"}`}>
                        {step.complete ? <CheckCircleIcon size={16} weight="fill" aria-label="Concluída" /> : index + 1}
                      </span>
                      <span className={`text-sm font-bold ${isCurrent ? "text-primary" : "text-foreground"}`}>{step.label}</span>
                    </span>
                    <span className="pl-9 text-xs text-muted-foreground">{step.detail}</span>
                  </span>
                );
                return <li key={step.label} className="list-none">{step.available ? <Link href={step.href} aria-current={isCurrent ? "step" : undefined}>{content}</Link> : <span aria-disabled="true">{content}</span>}</li>;
              })}
            </ol>
          </section>

          <section
            aria-labelledby="resumo-title"
            className="mt-10 rounded-xl border border-border bg-background"
          >
            <h2 id="resumo-title" className="sr-only">
              Resumo
            </h2>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric, index) => (
                <div
                  key={metric.label}
                  className={`p-5 sm:p-6 ${index > 0 ? "border-t border-border sm:border-l sm:border-t-0" : ""} ${index === 2 ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-muted-foreground">{metric.label}</p>
                    <metric.icon size={19} className="text-primary" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-3xl font-bold tracking-[-0.03em]">{metric.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <section
              aria-labelledby="acoes-title"
              className="rounded-xl border border-border bg-background p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="acoes-title" className="text-lg font-bold">
                    Atalhos rápidos
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Acesse diretamente uma tarefa específica.
                  </p>
                </div>
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-foreground">
                  Liberado
                </span>
              </div>
              <Link href={"/dashboard/configurar-avaliacao" as Route} className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
                Começar configuração guiada
              </Link>
              <div className="mt-6 divide-y divide-border">
                {actions.map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="group flex w-full items-center gap-4 py-4 text-left first:pt-0 last:pb-0"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                      <action.icon size={21} weight="bold" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-semibold">{action.label}</span>
                      <span className="block text-sm text-muted-foreground">{action.detail}</span>
                    </span>
                    <ArrowRightIcon
                      size={18}
                      className="ml-auto text-muted-foreground transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="atividade-title"
              className="rounded-xl bg-primary p-5 text-white sm:p-6"
            >
              <div className="flex items-center gap-3">
                <ClockIcon size={22} weight="bold" aria-hidden="true" />
                <h2 id="atividade-title" className="text-lg font-bold">
                  {reviewCount ? `${reviewCount} pendência${reviewCount > 1 ? "s" : ""}` : "Próximo passo"}
                </h2>
              </div>
              {reviewCount ? (
                <>
                  <p className="mt-5 text-sm leading-relaxed text-white/85">
                    Existem questões aguardando sua decisão antes de finalizar os resultados.
                  </p>
                  <Link
                    href="/dashboard/revisao"
                    className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-primary"
                  >
                    Abrir revisão
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </>
              ) : (
                <>
                  <p className="mt-5 font-semibold">{nextStep.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/85">
                    {nextStep.description}
                  </p>
                  <Link
                    href={nextStep.href}
                    className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-primary"
                  >
                    {nextStep.action}
                    <ArrowRightIcon aria-hidden="true" />
                  </Link>
                </>
              )}
            </section>
          </div>

          <section className="mt-8" aria-labelledby="recentes-title">
            <div className="flex items-center justify-between gap-4">
              <h2 id="recentes-title" className="text-lg font-bold">
                Avaliações recentes
              </h2>
              <Link href="/dashboard/avaliacoes" className="text-sm font-semibold text-primary">
                Ver todas
              </Link>
            </div>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-background">
              {recentExams?.length ? (
                recentExams.map((exam) => (
                  <Link
                    key={exam.id}
                    href={`/dashboard/avaliacoes/${exam.id}/cartoes`}
                    className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 hover:bg-surface"
                  >
                    <span>
                      <span className="block font-semibold">{exam.title}</span>
                      <span className="block text-sm text-muted-foreground">
                        {exam.classes?.[0]?.name || "Turma"} · {exam.subject}
                      </span>
                    </span>
                    <ArrowRightIcon className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))
              ) : (
                <div className="px-5 py-6">
                  <p className="font-semibold">Nenhuma avaliação criada.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Depois de cadastrar uma turma e os alunos, crie a avaliação para gerar os cartões.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
