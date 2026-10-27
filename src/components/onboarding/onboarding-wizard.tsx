"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveOfficeContactsAction,
  saveOfficeOperationAction,
  saveOfficeProfileAction,
} from "@/app/onboarding/actions";
import {
  OfficeContactsFields,
  OfficeOperationFields,
  OfficeProfileFields,
} from "@/components/onboarding/office-fields";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";
import { UnsupportedInsurerNotice } from "@/components/onboarding/unsupported-insurer-notice";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import type { OfficeOnboarding, OnboardingCatalogs } from "@/lib/db";
import {
  contactsFilled,
  operationFilled,
  profileFilled,
  resumeStep,
  toContactsValues,
  toOperationValues,
  toProfileValues,
} from "@/lib/onboarding/form";
import { lacksSupportedInsurer, worksWithMonterrey } from "@/lib/onboarding/options";
import { OnboardingImportStep } from "@/components/onboarding/onboarding-import-step";

const STEPS = ["Tu promotoría", "¿Quién eres?", "Tu operación"];
const STEP_INTROS = [
  "Lo básico de tu promotoría.",
  "Para saber con quién hablamos.",
  "Así preparamos LifeOps para cómo trabajas.",
];

/** Move to a step and bring the form top into view (phones scroll far down on long steps). */
function scrollFormTop() {
  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Signup → onboarding → dashboard. Each step is saved, so the promotoría can resume later. */
export function OnboardingWizard({
  data,
  catalogs,
}: {
  data: OfficeOnboarding | null;
  catalogs: OnboardingCatalogs;
}) {
  const { session, reloadProfile } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(() => resumeStep(data));
  const [profile, setProfile] = useState(() => toProfileValues(data));
  const [contacts, setContacts] = useState(() => toContactsValues(data));
  const [operation, setOperation] = useState(() => toOperationValues(data));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showInsurerNotice, setShowInsurerNotice] = useState(false);
  /** Monterrey promotorías get one more (optional) step to load their cartera */
  const [importStage, setImportStage] = useState(false);

  const enterDashboard = async (path = "/dashboard") => {
    await reloadProfile();
    router.replace(path);
  };

  const filled = [profileFilled(profile), contactsFilled(contacts), operationFilled(operation)][step];
  const isLast = step === STEPS.length - 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = session?.access_token;
    if (!token) {
      setFormError("Tu sesión expiró. Inicia sesión de nuevo.");
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const result =
        step === 0
          ? await saveOfficeProfileAction(token, profile)
          : step === 1
            ? await saveOfficeContactsAction(token, contacts)
            : await saveOfficeOperationAction(token, operation);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      if (!isLast) {
        setStep(step + 1);
        scrollFormTop();
        return;
      }
      if (worksWithMonterrey(operation.insurerCodes)) {
        // Saved: stay here (no profile reload yet, it would leave the page) and offer the import
        setImportStage(true);
        scrollFormTop();
        return;
      }
      if (lacksSupportedInsurer(operation.insurerCodes)) {
        // Saved; warn before entering (reloading the profile would leave this page)
        setShowInsurerNotice(true);
        return;
      }
      await enterDashboard();
    } catch (error) {
      console.error("onboarding step failed", error);
      setFormError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  if (importStage) {
    return <OnboardingImportStep steps={[...STEPS, "Tu cartera"]} onFinish={enterDashboard} />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <OnboardingSteps steps={STEPS} current={step} />

      <div key={step} className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-(--lifeops-accent)">
          Paso {step + 1} de {STEPS.length}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-(--lifeops-fg)">{STEPS[step]}</h2>
        <p className="mt-1 text-sm text-(--lifeops-muted)">{STEP_INTROS[step]}</p>
      </div>

      {step === 0 ? (
        <OfficeProfileFields
          values={profile}
          onChange={(patch) => setProfile((v) => ({ ...v, ...patch }))}
          errors={errors}
          disabled={saving}
          states={catalogs.states}
          agencyCodeLocked={false}
          autoFocus
        />
      ) : step === 1 ? (
        <OfficeContactsFields
          values={contacts}
          onChange={(patch) => setContacts((v) => ({ ...v, ...patch }))}
          errors={errors}
          disabled={saving}
          autoFocus
        />
      ) : (
        <OfficeOperationFields
          values={operation}
          onChange={(patch) => setOperation((v) => ({ ...v, ...patch }))}
          errors={errors}
          disabled={saving}
          insurers={catalogs.insurers}
          linesOfBusiness={catalogs.linesOfBusiness}
        />
      )}
      </div>

      {formError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      {/* Sticky on phones so the next step is always one tap away */}
      <div className="sticky bottom-0 -mx-5 flex gap-3 border-t border-(--lifeops-border) bg-(--lifeops-chrome) px-5 py-3 sm:static sm:mx-0 sm:justify-between sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setErrors({});
            setFormError("");
            setStep(step - 1);
            scrollFormTop();
          }}
          disabled={saving || step === 0}
          className={step === 0 ? "hidden sm:invisible sm:inline-flex" : undefined}
        >
          Atrás
        </Button>
        <Button type="submit" variant="brand" disabled={saving || !filled} className="flex-1 sm:flex-none sm:min-w-40">
          {saving ? "Guardando…" : isLast ? "Terminar registro" : "Siguiente"}
        </Button>
      </div>

      <AppDialog
        open={showInsurerNotice}
        title="Antes de entrar"
        description="Tu registro quedó guardado."
        onClose={() => void enterDashboard()}
      >
        <UnsupportedInsurerNotice
          insurerCodes={operation.insurerCodes}
          insurers={catalogs.insurers}
          otherInsurer={operation.otherInsurer}
        />
        <div className="flex justify-end">
          <Button type="button" variant="brand" onClick={() => void enterDashboard()}>
            Entendido, ir a LifeOps
          </Button>
        </div>
      </AppDialog>
    </form>
  );
}
