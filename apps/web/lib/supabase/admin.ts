import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente exclusivo de ações administrativas no servidor.
 * Nunca use este cliente em componentes ou rotas expostas ao navegador.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.includes("replace-with")) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_MISSING");
  }

  const env = getPublicEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
