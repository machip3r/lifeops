"use client";

import { useState } from "react";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { RegistryImport } from "@/components/extractor/registry-import";
import { RegistrySources } from "@/components/extractor/registry-sources";
import { ToastProvider } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { RegistrySource } from "@/lib/extractor/registry/fields";

/**
 * Last onboarding step for Seguros Monterrey promotorías: load the cartera from the Mina de Oro or
 * the plantilla before entering. Optional — the same import lives in Importar.
 */
export function OnboardingImportStep({ steps, onFinish }: { steps: string[]; onFinish: (path?: string) => Promise<void> }) {
  const [picked, setPicked] = useState<{ source: RegistrySource; file: File } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const finish = async (path?: string) => {
    setLeaving(true);
    await onFinish(path);
  };

  return (
    // Onboarding lives outside the dashboard shell, which provides the toasts
    <ToastProvider>
      <div className="flex flex-col gap-6">
        <OnboardingSteps steps={steps} current={steps.length - 1} />
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <p className="text-xs font-medium uppercase tracking-wide text-(--lifeops-accent)">
            Paso {steps.length} de {steps.length} · opcional
          </p>
          <h2 className="mt-1 text-xl font-semibold text-(--lifeops-fg)">Carga tu cartera</h2>
          <p className="mt-1 text-sm text-(--lifeops-muted)">
            Tu registro ya quedó guardado. Si tienes la Mina de Oro de Seguros Monterrey o tu cartera en Excel, súbela
            y empieza con tus pólizas, clientes y asesores desde hoy. También puedes hacerlo después desde Importar.
          </p>
        </div>

        {picked ? (
          <RegistryImport
            source={picked.source}
            file={picked.file}
            onExit={() => setPicked(null)}
            onUploadCommissions={() => void finish("/dashboard/extractor")}
            doneActions={
              <Button type="button" variant="brand" disabled={leaving} onClick={() => void finish()}>
                {leaving ? "Entrando…" : "Ir a LifeOps"}
              </Button>
            }
          />
        ) : (
          <RegistrySources onPick={(source, file) => setPicked({ source, file })} />
        )}

        {!picked ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" disabled={leaving} onClick={() => void finish()}>
              {leaving ? "Entrando…" : "Omitir por ahora"}
            </Button>
          </div>
        ) : null}
      </div>
    </ToastProvider>
  );
}
