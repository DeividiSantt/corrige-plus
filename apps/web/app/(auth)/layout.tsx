import Link from "next/link";
import { CheckCircleIcon, ShieldCheckIcon, TimerIcon } from "@phosphor-icons/react/dist/ssr";
import { productConfig } from "@corrige-plus/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(22rem,0.8fr)_1.2fr]">
      <section className="relative hidden overflow-hidden bg-primary p-10 text-white lg:flex lg:flex-col">
        <Link href="/" className="flex w-fit items-center gap-3" aria-label={`${productConfig.name}, início`}>
          <span className="grid size-11 place-items-center rounded-xl bg-white text-primary">
            <CheckCircleIcon size={24} weight="fill" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-[-0.02em]">{productConfig.name}</span>
        </Link>

        <div className="my-auto max-w-xl py-14">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">Correção com rastreabilidade</p>
          <h2 className="mt-5 text-balance text-4xl font-bold leading-tight tracking-[-0.04em] xl:text-5xl">
            Menos tempo conferindo cartões. Mais tempo ensinando.
          </h2>
          <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/80">
            Organize avaliações, processe respostas e entregue o resultado ao professor sem manter cópias permanentes dos arquivos.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-white/30 pl-4">
              <ShieldCheckIcon size={22} weight="bold" aria-hidden="true" />
              <p className="mt-3 font-semibold">Dados protegidos por instituição</p>
              <p className="mt-1 text-sm text-white/70">Acesso isolado por perfil e organização.</p>
            </div>
            <div className="border-l-2 border-white/30 pl-4">
              <TimerIcon size={22} weight="bold" aria-hidden="true" />
              <p className="mt-3 font-semibold">Arquivos temporários</p>
              <p className="mt-1 text-sm text-white/70">Fotos e resultados são eliminados após a entrega.</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-white/60">Ambiente inicial · Política de retenção temporária configurada</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex w-fit items-center gap-3 lg:hidden" aria-label={`${productConfig.name}, início`}>
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white">
              <CheckCircleIcon size={22} weight="fill" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold">{productConfig.name}</span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
