import { AuthForm } from "@/features/auth/auth-form";
import { signupAction } from "@/features/auth/actions";

export default function CadastroPage() {
  return <AuthForm mode="signup" action={signupAction} />;
}
