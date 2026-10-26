"use client";

import { useState } from "react";
import {
  saveOfficeContactsAction,
  saveOfficeOperationAction,
  saveOfficeProfileAction,
} from "@/app/onboarding/actions";
import { DetailCard } from "@/components/dashboard/detail-card";
import {
  OfficeContactsFields,
  OfficeOperationFields,
  OfficeProfileFields,
} from "@/components/onboarding/office-fields";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { useOfficeOnboarding } from "@/hooks/use-office-onboarding";
import type { OfficeOnboarding, OnboardingCatalogs } from "@/lib/db";
import {
  contactsFilled,
  operationFilled,
  profileFilled,
  toContactsValues,
  toOperationValues,
  toProfileValues,
} from "@/lib/onboarding/form";

type SaveResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** One editable Perfil card: own values, errors and save button. */
function useSection<T>(initial: T, save: (token: string, values: T) => Promise<SaveResult>, onSaved?: () => Promise<void>) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const result = await save(session.access_token, values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      await onSaved?.();
      toast.success("Cambios guardados.");
    } catch (error) {
      console.error("save office settings failed", error);
      toast.error("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const onChange = (patch: Partial<T>) => setValues((v) => ({ ...v, ...patch }));
  return { values, onChange, errors, saving, submit };
}

function SaveButton({ saving, disabled }: { saving: boolean; disabled: boolean }) {
  return (
    <div className="mt-6 flex justify-end">
      <Button type="submit" variant="brand" disabled={saving || disabled}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}

function OfficeSettingsForms({
  data,
  catalogs,
  reload,
}: {
  data: OfficeOnboarding | null;
  catalogs: OnboardingCatalogs;
  reload: () => Promise<void>;
}) {
  const { reloadProfile } = useAuth();
  const profile = useSection(toProfileValues(data), saveOfficeProfileAction, async () => {
    // Sidebar shows the promotoría name; the clave locks once saved
    await Promise.all([reloadProfile(), reload()]);
  });
  const contacts = useSection(toContactsValues(data), saveOfficeContactsAction);
  const operation = useSection(toOperationValues(data), saveOfficeOperationAction);
  const agencyCodeLocked = Boolean(data?.onboarding_completed_at && data?.agency_code);

  return (
    <>
      <form onSubmit={profile.submit} noValidate>
        <DetailCard title="Tu promotoría">
          <OfficeProfileFields
            values={profile.values}
            onChange={profile.onChange}
            errors={profile.errors}
            disabled={profile.saving}
            states={catalogs.states}
            agencyCodeLocked={agencyCodeLocked}
          />
          <SaveButton saving={profile.saving} disabled={!profileFilled(profile.values)} />
        </DetailCard>
      </form>

      <form onSubmit={contacts.submit} noValidate>
        <DetailCard title="Contacto">
          <OfficeContactsFields
            values={contacts.values}
            onChange={contacts.onChange}
            errors={contacts.errors}
            disabled={contacts.saving}
          />
          <SaveButton saving={contacts.saving} disabled={!contactsFilled(contacts.values)} />
        </DetailCard>
      </form>

      <form onSubmit={operation.submit} noValidate>
        <DetailCard title="Tu operación">
          <OfficeOperationFields
            values={operation.values}
            onChange={operation.onChange}
            errors={operation.errors}
            disabled={operation.saving}
            insurers={catalogs.insurers}
            linesOfBusiness={catalogs.linesOfBusiness}
          />
          <SaveButton saving={operation.saving} disabled={!operationFilled(operation.values)} />
        </DetailCard>
      </form>
    </>
  );
}

/** Perfil (promotoría): edit what was captured in onboarding. */
export function OfficeSettings({ officeId }: { officeId: string }) {
  const { data, catalogs, error, loading, reload } = useOfficeOnboarding(officeId);

  if (loading) {
    return <p className="text-sm text-(--lifeops-muted)">Cargando datos de la promotoría...</p>;
  }
  if (error || !catalogs) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive" role="alert">
          {error ?? "No se pudo cargar la información."}
        </p>
        <Button type="button" variant="outline" onClick={() => void reload()}>
          Reintentar
        </Button>
      </div>
    );
  }
  return <OfficeSettingsForms data={data} catalogs={catalogs} reload={reload} />;
}
