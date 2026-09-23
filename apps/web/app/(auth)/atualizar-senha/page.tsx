import { AuthForm } from "@/features/auth/auth-form";
import { updatePasswordAction } from "@/features/auth/actions";

export default function AtualizarSenhaPage() {
  return <AuthForm mode="update-password" action={updatePasswordAction} />;
}
