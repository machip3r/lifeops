import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDot,
  FileUp,
  FolderKanban,
  Mail,
  MessageCircle,
  UsersRound,
} from "lucide-react";
import { supportLinks } from "@/lib/support";
import { LandingHeader, LandingSectionLink, LandingTopLink } from "@/components/landing/landing-header";

/*
THESIS: LifeOps puts an office's policies, people, and collection work in one place; the page opens on the cobranza work itself.
OWN-WORLD: Existing LifeOps blue-gray surfaces, gold accent, Lexend headings, and Inter interface text.
STORY: A promotoría sees how imports become a workable policy portfolio and chooses to request a demo; existing users can sign in.
FIRST VIEWPORT: A fixed LifeOps wordmark, theme control, demo action, and sign-in; the offer and actions sit beside an illustrative collection board.
FORM: Cobranza desk, assigned structure 3 of 7; two-column desktop staging with a stacked mobile flow; structure seed 46674091.
*/

export const metadata: Metadata = {
  title: "LifeOps | Ordena tu cartera y cobranza",
  description:
    "Importa comisiones, consulta pólizas y recibos, y lleva el seguimiento de cobranza de tu promotoría.",
};

const sampleRows = [
  { policy: "SM-20481", client: "María Ríos", advisor: "Andrea L.", due: "Hoy", status: "Vence hoy", tone: "blue" },
  { policy: "SM-19834", client: "Jorge Medina", advisor: "Luis C.", due: "Hace 4 días", status: "Vencida", tone: "orange" },
  { policy: "SM-21706", client: "Elena Torres", advisor: "Andrea L.", due: "En 12 días", status: "Al corriente", tone: "gold" },
];

const steps = [
  {
    number: "1",
    icon: FileUp,
    title: "Importa comisiones y carteras",
    description:
      "Sube comisiones en HTML, una cartera compatible o la plantilla. Revisa los datos antes de guardarlos; también puedes dar de alta una póliza manualmente.",
  },
  {
    number: "2",
    icon: FolderKanban,
    title: "Completa el expediente",
    description:
      "Consulta el cliente, asesor, recibos y documentos relacionados con cada póliza.",
  },
  {
    number: "3",
    icon: CircleDot,
    title: "Revisa los pagos pendientes",
    description:
      "Ubica recibos por vencer o atrasados y registra los pagos desde la cartera o el expediente.",
  },
];

const demoLinks = supportLinks(
  "Agenda una demo de LifeOps",
  "Hola, quiero agendar una demo de LifeOps para mi promotoría. ¿Qué horarios tienen disponibles?",
);

function Brand() {
  return (
    <LandingTopLink className="inline-flex items-baseline tracking-[-0.04em]">
      <span className="font-title text-[19px] font-normal text-(--lifeops-fg)">Life</span>
      <span className="font-title text-[19px] font-bold text-(--lifeops-fg)">
        Ops
      </span>
    </LandingTopLink>
  );
}

function CollectionPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto">
      <div className="absolute -inset-5 rounded-[2rem] bg-[#FBDBAC]/[0.08] blur-2xl" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-(--lifeops-border) bg-white text-(--lifeops-fg) shadow-[0_28px_80px_-30px_rgba(0,0,0,0.2)] dark:border-[#41454d] dark:bg-[#1c2027] dark:text-white dark:shadow-[0_28px_80px_-30px_rgba(0,0,0,0.75)]">
        <div className="flex items-center justify-between border-b border-(--lifeops-border) px-5 py-4 sm:px-6 dark:border-white/10">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent) dark:bg-white/[0.06] dark:text-[#FBDBAC]">
              <FolderKanban className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Cobranza</p>
              <p className="mt-0.5 text-xs text-(--lifeops-muted)">Cartera de la promotoría</p>
            </div>
          </div>
          <span className="rounded-full border border-[#b38122]/30 bg-[#b38122]/[0.08] px-2.5 py-1 text-[10px] font-medium text-[#775714] dark:border-[#FBDBAC]/25 dark:bg-[#FBDBAC]/[0.08] dark:text-[#FBDBAC]">
            DATOS DE EJEMPLO
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-(--lifeops-border) border-b border-(--lifeops-border) dark:divide-white/10 dark:border-white/10">
          <div className="px-4 py-4 sm:px-6">
            <p className="text-[11px] text-(--lifeops-muted)">Por cobrar</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight">08</p>
          </div>
          <div className="px-4 py-4 sm:px-6">
            <p className="text-[11px] text-(--lifeops-muted)">Vencen hoy</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[#775714] dark:text-[#FBDBAC]">02</p>
          </div>
          <div className="px-4 py-4 sm:px-6">
            <p className="text-[11px] text-(--lifeops-muted)">En peligro</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-[#e99372]">01</p>
          </div>
        </div>

        <div className="px-4 pb-2 pt-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-(--lifeops-fg) dark:text-white/80">Próximos recibos</p>
            <span className="text-[11px] text-(--lifeops-muted)">3 de 8 pólizas</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.08em] text-(--lifeops-muted) dark:text-white/55">
                <tr>
                  <th className="pb-2.5 font-medium">Póliza · cliente</th>
                  <th className="pb-2.5 font-medium">Asesor</th>
                  <th className="pb-2.5 font-medium">Vence</th>
                  <th className="pb-2.5 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row) => (
                  <tr key={row.policy} className="border-t border-(--lifeops-border) dark:border-white/[0.08]">
                    <td className="py-3 pr-3">
                      <span className="block font-mono text-[11px] text-(--lifeops-fg) dark:text-white/85">{row.policy}</span>
                      <span className="mt-0.5 block text-[11px] text-(--lifeops-muted)">{row.client}</span>
                    </td>
                    <td className="py-3 pr-3 text-(--lifeops-muted)">{row.advisor}</td>
                    <td className="py-3 pr-3 text-(--lifeops-muted)">{row.due}</td>
                    <td className="py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium ${row.tone === "orange"
                            ? "bg-[#e99372]/[0.12] text-[#f0a489]"
                            : row.tone === "blue"
                              ? "bg-[#81a9d5]/[0.12] text-[#a9c7eb]"
                              : "bg-[#FBDBAC]/[0.12] text-[#FBDBAC]"
                          }`}
                      >
                        <span className="size-1.5 rounded-full bg-current" aria-hidden />
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 border-t border-(--lifeops-border) bg-(--lifeops-chrome) px-5 py-3.5 text-[11px] text-(--lifeops-muted) sm:px-6 dark:border-white/10 dark:bg-white/[0.025]">
          <Check className="size-3.5 text-(--lifeops-accent) dark:text-[#FBDBAC]" aria-hidden />
          Cartera compartida con acceso individual para cada asesor
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-(--lifeops-page) text-(--lifeops-fg)">
      <LandingHeader />

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-28 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:px-12 lg:pb-28 lg:pt-32">
        <div className="relative z-10 max-w-[570px]">
          <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-(--lifeops-accent)">
            Cartera y cobranza de tu promotoría
          </p>
          <h1 className="font-title text-[clamp(2.65rem,5.2vw,4.4rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-(--lifeops-fg)">
            Cada póliza, su cliente y el pago que sigue.
          </h1>
          <p className="mt-6 max-w-[50ch] text-base leading-7 text-(--lifeops-muted) sm:text-lg sm:leading-8">
            Importa comisiones, consulta recibos por vencer o atrasados y registra pagos. La cartera reúne la información de tus pólizas, clientes y asesores.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <LandingSectionLink
              targetId="contact"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#FBDBAC] px-5 text-sm font-semibold text-[#1a1d24] transition-colors hover:bg-[#f5c98a] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/50"
            >
              Solicitar una demo <ArrowRight className="size-4" aria-hidden />
            </LandingSectionLink>
            <LandingSectionLink
              targetId="how-it-works"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium text-(--lifeops-muted) transition-colors hover:text-(--lifeops-fg) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/40"
            >
              Ver cómo funciona <ArrowDownRight className="size-4" aria-hidden />
            </LandingSectionLink>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-(--lifeops-border) pt-5 text-xs text-(--lifeops-muted)">
            <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-(--lifeops-accent)" aria-hidden /> Recibos por póliza</span>
            <span className="inline-flex items-center gap-2"><Check className="size-3.5 text-(--lifeops-accent)" aria-hidden /> Seguimiento por asesor</span>
          </div>
        </div>
        <div className="relative lg:pl-2">
          <CollectionPreview />
          <div className="mx-auto mt-4 flex max-w-[620px] items-start justify-end gap-2 text-right text-[11px] leading-5 text-(--lifeops-muted)">
            <span>Los nombres, pólizas y cifras de esta vista son ficticios.</span>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-y border-(--lifeops-border) bg-(--lifeops-chrome)/55">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold text-(--lifeops-accent)">Importación, cartera y cobranza</p>
            <h2 className="font-title text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              Del archivo de comisiones al recibo por cobrar.
            </h2>
            <p className="mt-4 max-w-[62ch] leading-7 text-(--lifeops-muted)">
              Revisa los datos antes de importarlos. Después, cada póliza reúne su cliente, asesor, recibos y documentos.
            </p>
            <p className="mt-3 max-w-[62ch] text-xs leading-5 text-(--lifeops-muted)">
              La importación de cartera desde reportes está disponible para Seguros Monterrey New York Life.
            </p>
          </div>
          <div className="mt-11 grid gap-8 sm:grid-cols-3 sm:gap-7 lg:gap-12">
            {steps.map(({ number, icon: Icon, title, description }) => (
              <article key={number} className="relative border-t border-(--lifeops-border) pt-5">
                <div className="flex items-center justify-between">
                  <span className="font-title text-sm font-medium tabular-nums text-(--lifeops-accent)">{number.padStart(2, "0")}</span>
                  <Icon className="size-[18px] text-(--lifeops-muted)" strokeWidth={1.7} aria-hidden />
                </div>
                <h3 className="mt-5 font-title text-lg font-semibold tracking-[-0.02em]">{title}</h3>
                <p className="mt-2.5 max-w-[36ch] text-sm leading-6 text-(--lifeops-muted)">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="who-its-for" className="scroll-mt-20 mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-20 lg:px-12 lg:py-24">
        <div>
          <p className="mb-3 text-sm font-semibold text-(--lifeops-accent)">Accesos según el rol</p>
          <h2 className="font-title text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
            La promotoría consulta toda la cartera; cada asesor, la propia.
          </h2>
        </div>
        <div className="grid gap-7 border-y border-(--lifeops-border) py-7 sm:grid-cols-2 sm:gap-10 sm:py-8">
          <div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
              <UsersRound className="size-[18px]" aria-hidden />
            </div>
            <h3 className="mt-4 font-title text-base font-semibold">Para la promotoría</h3>
            <p className="mt-2 text-sm leading-6 text-(--lifeops-muted)">
              Revisa la cartera completa, administra pólizas y asesores y da seguimiento a los pagos.
            </p>
          </div>
          <div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
              <FolderKanban className="size-[18px]" aria-hidden />
            </div>
            <h3 className="mt-4 font-title text-base font-semibold">Para cada asesor</h3>
            <p className="mt-2 text-sm leading-6 text-(--lifeops-muted)">
              Consulta sus pólizas, clientes y recibos sin acceder a la cartera de otros asesores.
            </p>
          </div>
        </div>
      </section>

      <section id="contact" className="scroll-mt-20 border-t border-(--lifeops-border) bg-(--lifeops-chrome)/55">
        <div className="mx-auto grid max-w-7xl gap-9 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:px-12 lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-3 text-sm font-semibold text-(--lifeops-accent)">Acceso por invitación</p>
            <h2 className="font-title text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              Solicita una demo de LifeOps.
            </h2>
            <p className="mt-4 max-w-[58ch] leading-7 text-(--lifeops-muted)">
              Escríbenos por WhatsApp o correo para coordinarla. Las cuentas se habilitan por invitación.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[390px] lg:justify-end">
            {demoLinks.map((link, index) => {
              const isWhatsApp = link.href.startsWith("https://wa.me/");
              const Icon = isWhatsApp ? MessageCircle : Mail;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  target={isWhatsApp ? "_blank" : undefined}
                  rel={isWhatsApp ? "noreferrer" : undefined}
                  className={
                    index === 0
                      ? "inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#FBDBAC] px-5 text-sm font-semibold text-[#1a1d24] transition-colors hover:bg-[#f5c98a] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/50"
                      : "inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) px-5 text-sm font-medium text-(--lifeops-fg) transition-colors hover:border-(--lifeops-accent)/60 hover:bg-(--lifeops-hover) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/40"
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {isWhatsApp ? "Solicitar por WhatsApp" : "Solicitar por correo"}
                  {isWhatsApp ? <ArrowUpRight className="size-4" aria-hidden /> : null}
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-(--lifeops-border) bg-(--lifeops-chrome)/55">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
          <div>
            <Brand />
            <p className="mt-2 text-xs text-(--lifeops-muted)">Pólizas y cobranza de tu promotoría.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-(--lifeops-muted)">
            <LandingSectionLink targetId="how-it-works" className="hover:text-(--lifeops-fg)">Cómo funciona</LandingSectionLink>
            <LandingSectionLink targetId="who-its-for" className="hover:text-(--lifeops-fg)">Para quién es</LandingSectionLink>
            <LandingSectionLink targetId="contact" className="hover:text-(--lifeops-fg)">Contacto</LandingSectionLink>
            <Link href="/login" className="font-medium text-(--lifeops-accent) hover:underline">Iniciar sesión</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
