import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://127.0.0.1:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_CORRECTION_API_URL: z.url().default("http://127.0.0.1:8000"),
});

export function getPublicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CORRECTION_API_URL: process.env.NEXT_PUBLIC_CORRECTION_API_URL,
  });

  if (!result.success) {
    const missingNames = result.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    const detail =
      process.env.NODE_ENV === "development" && missingNames
        ? ` Variáveis ausentes ou inválidas: ${missingNames}.`
        : "";
    throw new Error(`Configuração pública inválida.${detail}`);
  }

  return result.data;
}

export function getAppOrigin() {
  return new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).origin;
}

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key && !url.includes("replace-with") && !key.includes("replace-with"));
}
