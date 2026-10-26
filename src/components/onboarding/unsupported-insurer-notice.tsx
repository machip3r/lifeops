import { TriangleAlert } from "lucide-react";
import { OTHER_CODE } from "@/lib/onboarding/options";
import type { CatalogOption } from "@/lib/supabase";
import { supportLinks } from "@/lib/support";
import { cn } from "@/lib/utils";

/** Selected aseguradoras → names for the support message ("Otra" uses the typed name). */
function insurerNames(codes: string[], insurers: CatalogOption[], otherInsurer: string): string {
  return codes
    .map((code) =>
      code === OTHER_CODE ? otherInsurer.trim() || "otra" : insurers.find((i) => i.code === code)?.name ?? code,
    )
    .join(", ");
}

/** Shown when none of the selected aseguradoras is Seguros Monterrey (the only one supported today). */
export function UnsupportedInsurerNotice({
  insurerCodes,
  insurers,
  otherInsurer,
  className,
}: {
  insurerCodes: string[];
  insurers: CatalogOption[];
  otherInsurer: string;
  className?: string;
}) {
  const names = insurerNames(insurerCodes, insurers, otherInsurer);
  const links = supportLinks(
    "Quiero usar LifeOps con otra aseguradora",
    `Hola, me interesa usar LifeOps con: ${names}.`,
  );

  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4 text-sm text-(--lifeops-fg)",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
      <div className="flex flex-col gap-2">
        <p className="font-semibold">Por ahora LifeOps solo funciona con Seguros Monterrey</p>
        <p className="text-(--lifeops-muted)">
          Las funciones de LifeOps, como importar comisiones y llevar la cobranza a partir de los
          reportes, están hechas para Seguros Monterrey New York Life. Si te interesa usar LifeOps
          con {names}, escríbenos: nos ayuda a decidir qué aseguradora sumar después.
        </p>
        {links.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-(--lifeops-accent) underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-(--lifeops-muted)">Contacta a soporte de LifeOps para contarnos qué necesitas.</p>
        )}
      </div>
    </div>
  );
}
