import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const ACTIVE_ORGANIZATION_COOKIE = "corrige-active-organization";

export async function workspaceData() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Sessão inválida.");
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
    .from("profiles")
    .select("organization_id,full_name,role")
    .eq("user_id", user.user.id)
    .single(),
    supabase
      .from("organization_memberships")
      .select("organization_id,full_name,role,organizations(name,kind)")
      .eq("user_id", user.user.id)
      .order("created_at"),
  ]);
  if (!profile) throw new Error("Instituição não encontrada.");
  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const activeMembership = memberships?.find((membership) => membership.organization_id === requestedOrganizationId)
    ?? memberships?.find((membership) => membership.organization_id === profile.organization_id)
    ?? memberships?.[0];
  if (!activeMembership) throw new Error("Nenhuma instituição disponível para esta conta.");
  return {
    supabase,
    userId: user.user.id,
    organizationId: activeMembership.organization_id,
    profile: { full_name: profile.full_name, role: activeMembership.role },
    memberships: memberships ?? [],
  };
}
