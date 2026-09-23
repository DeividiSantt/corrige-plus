"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConfirmationState = "confirming" | "error";

function safeDestination(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export default function ConfirmAuthPage() {
  const [state, setState] = useState<ConfirmationState>("confirming");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function confirmSession() {
      const currentUrl = new URL(window.location.href);
      const destination = safeDestination(currentUrl.searchParams.get("next"));
      const client = createClient();
      const code = currentUrl.searchParams.get("code");
      const hash = new URLSearchParams(currentUrl.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      const result = code
        ? await client.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : { error: new Error("Link incompleto.") };

      if (result.error) {
        setMessage("Não foi possível confirmar este link. Solicite um novo acesso.");
        setState("error");
        return;
      }

      window.location.replace(destination);
    }

    void confirmSession();
  }, []);

  if (state === "error") {
    return (
      <main className="grid min-h-dvh place-items-center bg-surface p-6">
        <section className="w-full max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold">Não foi possível confirmar o acesso</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <a href="/login" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
            Ir para o login
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-6">
      <p className="text-sm font-medium text-muted-foreground">Confirmando seu acesso…</p>
    </main>
  );
}