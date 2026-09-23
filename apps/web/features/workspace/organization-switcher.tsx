"use client";

import { CaretDownIcon, BuildingsIcon } from "@phosphor-icons/react";
import { selectOrganizationAction } from "@/features/workspace/organization-actions";

type Membership = { organization_id: string; organizations: { name: string; kind: string } | { name: string; kind: string }[] | null };

export function OrganizationSwitcher({ memberships, activeOrganizationId }: { memberships: Membership[]; activeOrganizationId: string }) {
  if (memberships.length < 2) return null;
  return <form action={selectOrganizationAction} className="relative">
    <label className="sr-only" htmlFor="organizationId">Instituição ativa</label>
    <BuildingsIcon size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary" aria-hidden="true" />
    <select id="organizationId" name="organizationId" defaultValue={activeOrganizationId} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="h-10 max-w-52 appearance-none rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm font-semibold text-foreground">
      {memberships.map((membership) => {
        const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
        return <option key={membership.organization_id} value={membership.organization_id}>{organization?.kind === "personal" ? `Meu espaço · ${organization?.name || "Pessoal"}` : organization?.name || "Instituição"}</option>;
      })}
    </select>
    <CaretDownIcon size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  </form>;
}
