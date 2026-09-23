import Link from "next/link";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { InvitationConfirmation } from "@/features/workspace/invitation-confirmation";

export default async function InvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <main className="mx-auto max-w-lg p-8"><WarningCircleIcon size={28} className="text-danger" weight="fill" /><h1 className="mt-4 text-2xl font-bold">Convite inválido</h1><Link className="mt-4 inline-block font-semibold text-primary" href="/dashboard">Ir ao painel</Link></main>;
  return <InvitationConfirmation token={token} />;
}
