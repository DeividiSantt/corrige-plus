import { AuthForm } from "@/features/auth/auth-form";
import { recoverPasswordAction } from "@/features/auth/actions";

export default function RecuperarSenhaPage() {
  return <AuthForm mode="recover" action={recoverPasswordAction} />;
}
