import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { productConfig } from "@corrige-plus/config";
import { isAuthEntryPath, isPublicAuthPath } from "@/features/auth/helpers";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const path = request.nextUrl.pathname;
  const isAuthEntryRoute = isAuthEntryPath(path);
  const isPublicRoute = isPublicAuthPath(path);

  // Public auth routes should render even if Supabase is slow or temporarily unavailable.
  if (isPublicRoute) return response;

  if (!supabaseUrl || !publishableKey) return response;

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  let isAuthenticated = false;

  try {
    const { data } = await supabase.auth.getClaims();
    isAuthenticated = Boolean(data?.claims?.sub);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[supabase-proxy] session_check_failed", {
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const url = request.nextUrl.clone();
    url.pathname = productConfig.routes.login;
    url.searchParams.set("next", path);
    url.searchParams.set("error", "Sessao indisponivel. Tente novamente.");
    return NextResponse.redirect(url);
  }

  if (!isAuthenticated && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = productConfig.routes.login;
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isAuthenticated && isAuthEntryRoute) {
    return NextResponse.redirect(new URL(productConfig.routes.home, request.url));
  }

  return response;
}
