import { loginAction } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return <AuthForm mode="login" action={loginAction} next={params.next} initialMessage={params.error} />;
}
