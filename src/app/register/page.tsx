import Link from "next/link";
import { getPromotoryRegistrationTokenAdmin } from "@/lib/db-admin";
import { PromotoryRegistrationForm } from "@/components/auth/promotory-registration-form";
import { RegistrationSessionGuard } from "@/components/auth/registration-session-guard";

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
      <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 px-4 dark:from-gray-900 dark:to-gray-800">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/" aria-label="LifeOps, inicio" className="inline-flex items-baseline tracking-[-0.04em] text-4xl text-gray-900 dark:text-white">
              <span className="font-title font-normal">Life</span><span className="font-title font-bold">Ops</span>
            </Link>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Registro de promotoría</p>
          </div>
          <div className="rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
            {status === "valid" ? <PromotoryRegistrationForm token={token} /> : (
              <div className="space-y-4 text-center">
                <p className="text-sm text-gray-700 dark:text-gray-200" role="alert">
                  {status === "expired" ? "Este enlace venció." : status === "used" ? "Este enlace ya se usó." : "Este enlace no es válido."}
                  {" "}Solicita un enlace nuevo a quien te invitó.
                </p>
                <Link href="/login" className="text-sm font-medium text-(--lifeops-accent) hover:underline">Ir a iniciar sesión</Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </RegistrationSessionGuard>
  );
}
