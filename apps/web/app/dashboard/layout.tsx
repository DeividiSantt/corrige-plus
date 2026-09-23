import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") redirect("/login?setup=required");
    return children;
  }

  const supabase = await createClient();
  let data: Awaited<ReturnType<typeof supabase.auth.getClaims>>["data"] | null = null;

  try {
    ({ data } = await supabase.auth.getClaims());
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[dashboard-layout] session_check_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    redirect("/login?next=/dashboard&error=Sessao%20indisponivel.%20Tente%20novamente.");
  }

  if (!data?.claims?.sub) redirect("/login?next=/dashboard");

  return children;
}
