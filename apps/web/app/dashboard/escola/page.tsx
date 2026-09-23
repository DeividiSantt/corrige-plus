import Link from "next/link";
import { BuildingIcon, CheckCircleIcon, ClockIcon, UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { SchoolTeamManager } from "@/features/workspace/school-team-manager";
import { SchoolProfileManager } from "@/features/workspace/school-profile-manager";
import { SchoolCreateManager } from "@/features/workspace/school-create-manager";
import { workspaceData } from "@/features/workspace/data";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default async function SchoolPage() {
  const { supabase, organizationId, profile, memberships } = await workspaceData();
  const canManageRole = profile.role === "organization_admin" || profile.role === "platform_admin";
  const [{ data: school }, { data: teachers }, { data: invitations }] = await Promise.all([
    supabase.from("organizations").select("name,city,contact_email,kind").eq("id", organizationId).single(),
    supabase
      .from("organization_memberships")
      .select("id,full_name,role,created_at")
      .eq("organization_id", organizationId)
      .order("full_name"),
    canManageRole
      ? supabase
          .from("school_invitations")
          .select("id,email,full_name,status,created_at,expires_at")
          .eq("organization_id", organizationId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const isSchool = school?.kind === "school";
  const canManage = isSchool && canManageRole;
  const needsSetup = !school?.name || school.name === "Minha instituição";
  const schoolMemberships = memberships.filter((membership) => {
    const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
    return organization?.kind === "school";
  });

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-10">
      <Link href="/dashboard" className="text-sm font-semibold text-primary">← Painel</Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">{isSchool ? "Gestão escolar" : "Espaço pessoal"}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em]">{isSchool ? (canManage ? "Escola e equipe" : "Minha escola") : "Meu espaço e instituições"}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{isSchool ? (needsSetup && canManage ? "Complete os dados da instituição. Em seguida, convide professores para trabalhar na mesma escola." : "Professores convidados entram nesta escola e trabalham somente nas próprias turmas, avaliações e correções.") : "Suas provas particulares ficam aqui. Crie ou entre em instituições sem misturar seus dados pessoais."}</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-lg bg-primary-soft px-3 py-2 text-sm font-semibold text-primary sm:self-auto">
          <BuildingIcon size={18} weight="fill" aria-hidden="true" />
          {isSchool ? school?.name || "Escola" : "Meu espaço"}
        </div>
      </div>

      {!isSchool && <section className="mt-8 rounded-xl border border-border bg-background p-5"><h2 className="font-bold">Instituições vinculadas</h2><p className="mt-1 text-sm text-muted-foreground">Troque de instituição pelo seletor no painel.</p>{schoolMemberships.length ? <ul className="mt-4 divide-y divide-border">{schoolMemberships.map((membership) => { const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations; return <li key={membership.organization_id} className="py-3 font-semibold">{organization?.name || "Instituição"}</li>; })}</ul> : <p className="mt-4 text-sm text-muted-foreground">Você ainda não participa de uma instituição.</p>}</section>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          {isSchool && <section className="rounded-xl border border-border bg-background" aria-labelledby="team-title">
            <div className="flex items-center justify-between gap-4 border-b border-border p-5">
              <div>
                <h2 id="team-title" className="font-bold">Equipe da escola</h2>
                <p className="mt-1 text-sm text-muted-foreground">Cada professor enxerga e corrige apenas o que criou.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-semibold"><UsersThreeIcon size={17} aria-hidden="true" />{teachers?.length || 0}</span>
            </div>
            <div className="divide-y divide-border">
              {teachers?.map((teacher) => {
                const isAdmin = teacher.role === "organization_admin" || teacher.role === "platform_admin";
                return (
                  <div key={teacher.id} className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{teacher.full_name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Entrou em {formatDate(teacher.created_at)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isAdmin ? "bg-primary-soft text-primary" : "bg-surface text-muted-foreground"}`}>{isAdmin ? "Coordenação" : "Professor"}</span>
                  </div>
                );
              })}
            </div>
          </section>}

          {isSchool && canManage && !needsSetup && (
            <section className="rounded-xl border border-border bg-background" aria-labelledby="pending-title">
              <div className="border-b border-border p-5"><h2 id="pending-title" className="font-bold">Convites pendentes</h2><p className="mt-1 text-sm text-muted-foreground">Expiram sete dias após o envio.</p></div>
              {invitations?.length ? <div className="divide-y divide-border">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between gap-4 p-5"><div className="min-w-0"><p className="truncate font-semibold">{invitation.full_name}</p><p className="truncate text-sm text-muted-foreground">{invitation.email}</p></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-foreground"><ClockIcon size={14} aria-hidden="true" />até {formatDate(invitation.expires_at)}</span></div>)}</div> : <p className="p-5 text-sm text-muted-foreground">Nenhum convite pendente.</p>}
            </section>
          )}
        </div>

        {isSchool && canManage ? <div className="space-y-6"><SchoolProfileManager school={{ name: school?.name || "", city: school?.city || null, contactEmail: school?.contact_email || null }} needsSetup={needsSetup} />{!needsSetup && <SchoolTeamManager />}</div> : isSchool ? <section className="rounded-xl border border-border bg-background p-5"><CheckCircleIcon size={24} className="text-success" weight="fill" aria-hidden="true" /><h2 className="mt-3 font-bold">Você está vinculado a esta escola</h2><p className="mt-1 text-sm text-muted-foreground">A coordenação gerencia os acessos. Suas turmas e correções continuam privadas para você.</p></section> : <SchoolCreateManager />}
      </div>
    </main>
  );
}
