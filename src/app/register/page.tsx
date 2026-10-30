import Link from "next/link";
import { getPromotoryRegistrationTokenAdmin } from "@/lib/db-admin";
import { PromotoryRegistrationForm } from "@/components/auth/promotory-registration-form";
import { RegistrationSessionGuard } from "@/components/auth/registration-session-guard";
import { AuthLayout } from "@/components/auth/auth-layout";

type RegistrationStatus = "valid" | "invalid" | "expired" | "used";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  let status: RegistrationStatus = "invalid";
  if (/^[a-f0-9]{64}$/i.test(token)) {
    try {
      const result = await getPromotoryRegistrationTokenAdmin(token);
      status = result.valid ? "valid" : result.reason;
    } catch (error) {
      console.error("promotory registration token lookup:", error);
    }
  }

  return (
    <RegistrationSessionGuard>
      <AuthLayout imageSide="left">
        <div className="w-full max-w-[420px]">
          <header className="mb-9">
            <Link href="/" aria-label="LifeOps, inicio" className="inline-flex items-baseline tracking-[-0.04em] text-[38px] text-(--lifeops-fg)">
              <span className="font-title font-normal">Life</span><span className="font-title font-bold">Ops</span>
            </Link>
            <p className="mt-5 text-sm font-medium text-(--lifeops-accent)">Acceso a LifeOps</p>
            <h1 className="mt-2 font-title text-2xl font-semibold tracking-[-0.035em] text-(--lifeops-fg) sm:text-[28px]">
              {status === "valid" ? "Crea tu cuenta" : "Invitación no disponible"}
            </h1>
            <p className="mt-2 max-w-[38ch] text-sm leading-6 text-(--lifeops-muted)">
              {status === "valid"
                ? "Completa tu registro para configurar el acceso de tu promotoría."
                : "Solicita un enlace nuevo a la persona que te invitó para continuar."}
            </p>
          </header>

          <div className="rounded-2xl border border-(--lifeops-border)/70 bg-(--lifeops-chrome)/75 p-6 shadow-[0_24px_70px_-42px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:p-8 dark:border-(--lifeops-border) dark:bg-(--lifeops-chrome)/80">
            {status === "valid" ? <PromotoryRegistrationForm token={token} /> : (
              <div className="space-y-5">
                <p className="text-sm leading-6 text-(--lifeops-fg)" role="alert">
                  {status === "expired" ? "Este enlace venció." : status === "used" ? "Este enlace ya se usó." : "Este enlace no es válido."}
                  {" "}Pide que te envíen uno nuevo.
                </p>
                <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-md bg-[#FBDBAC] px-4 text-sm font-semibold text-[#1a1d24] transition-colors hover:bg-[#f5c98a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--lifeops-accent) focus-visible:ring-offset-2">
                  Ir a iniciar sesión
                </Link>
              </div>
            )}
          </div>
        </div>
      </AuthLayout>
    </RegistrationSessionGuard>
  );
}
