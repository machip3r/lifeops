"use client";

import { useState, type ReactNode } from "react";
import {
  saveOfficeContactsAction,
  saveOfficeOperationAction,
  saveOfficeProfileAction,
} from "@/app/onboarding/actions";
import { DetailCard, DetailRow, DetailRows } from "@/components/dashboard/detail-card";
import { EditButton, ProfileAvatar } from "@/components/dashboard/profile-parts";
import {
  OfficeContactsFields,
  OfficeOperationFields,
  OfficeProfileFields,
} from "@/components/onboarding/office-fields";
import { useToast } from "@/components/toast";
import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { DotBadge } from "@/components/ui/dot-badge";
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
import {
  ACTIVE_POLICY_RANGE_OPTIONS,
  CONSULTANT_COUNT_RANGE_OPTIONS,
  JOB_ROLE_OPTIONS,
  OTHER_CODE,
  PRIMARY_GOAL_OPTIONS,
} from "@/lib/onboarding/options";
import { formatDateShortEsLocal } from "@/lib/format/date";
import { formatMxPhone } from "@/lib/validation/input-filters";
import { CardSkeleton } from "@/components/ui/skeleton";

type SaveResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
type Section = "profile" | "contacts" | "operation";

const labelOf = (options: Array<{ value: string; label: string }>, value: string | null | undefined) =>
  options.find((o) => o.value === value)?.label ?? null;

function Tags({ items, empty = "Sin capturar" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <span className="text-(--lifeops-muted)">{empty}</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-(--lifeops-border) bg-(--lifeops-hover)/50 px-2.5 py-0.5 text-xs text-(--lifeops-fg)"
        >
          {item}
        </span>
      ))}
    </span>
  );
}

/** Edit one section in a dialog: own values, errors and save. */
function SectionDialog<T>({
  open,
  title,
  description,
  initial,
  save,
  canSave,
  onClose,
  onSaved,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: T;
  save: (token: string, values: T) => Promise<SaveResult>;
  canSave: (values: T) => boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  children: (props: {
    values: T;
    onChange: (patch: Partial<T>) => void;
    errors: Record<string, string>;
    disabled: boolean;
  }) => ReactNode;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Fresh copy of the saved data each time the dialog opens
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValues(initial);
      setErrors({});
    }
  }

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
      await onSaved();
      toast.success("Cambios guardados.");
      onClose();
    } catch (error) {
      console.error("save office settings failed", error);
      toast.error("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title={title}
      description={description}
      onClose={() => (saving ? undefined : onClose())}
      busy={saving}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="office-section-form" variant="brand" size="lg" disabled={saving || !canSave(values)}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
    >
      <form id="office-section-form" onSubmit={submit} noValidate>
        {children({ values, onChange: (patch) => setValues((v) => ({ ...v, ...patch })), errors, disabled: saving })}
      </form>
    </AppDialog>
  );
}

function OfficeProfileView({
  data,
  catalogs,
  reload,
  aside,
}: {
  data: OfficeOnboarding | null;
  catalogs: OnboardingCatalogs;
  reload: () => Promise<void>;
  aside?: ReactNode;
}) {
  const { reloadProfile } = useAuth();
  const [editing, setEditing] = useState<Section | null>(null);
  const close = () => setEditing(null);

  const profile = toProfileValues(data);
  const contacts = toContactsValues(data);
  const operation = toOperationValues(data);
  const agencyCodeLocked = Boolean(data?.onboarding_completed_at && data?.agency_code);
  const stateName = catalogs.states.find((s) => s.code === profile.stateCode)?.name ?? null;
  const insurerNames = operation.insurerCodes.map((code) =>
    code === OTHER_CODE ? operation.otherInsurer || "Otra" : catalogs.insurers.find((i) => i.code === code)?.name ?? code,
  );
  const lineNames = operation.lineCodes.map((code) => catalogs.linesOfBusiness.find((l) => l.code === code)?.name ?? code);
  const ownerIsRegistrant = contacts.jobRole === "OWNER";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5">
          <div className="flex items-center gap-4">
            <ProfileAvatar name={profile.officeName} />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-(--lifeops-fg)">{profile.officeName || "Tu promotoría"}</p>
              <p className="truncate text-sm text-(--lifeops-muted)">
                Promotoría{stateName ? ` · ${stateName}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {data?.onboarding_completed_at ? (
              <DotBadge label="Registro completo" color="var(--viz-current)" />
            ) : (
              <DotBadge label="Registro pendiente" color="var(--viz-overdue)" />
            )}
            {profile.agencyCode ? (
              <span className="rounded-full border border-(--lifeops-border) px-2 py-0.5 font-mono text-xs text-(--lifeops-fg)">
                {profile.agencyCode}
              </span>
            ) : null}
          </div>
          <dl className="mt-5 space-y-3 border-t border-(--lifeops-border) pt-4 text-[13px]">
            <div>
              <dt className="text-xs text-(--lifeops-muted)">Correo de la cuenta</dt>
              <dd className="mt-0.5 break-all text-(--lifeops-fg)">{data?.email || "—"}</dd>
            </div>
            {data?.created_at ? (
              <div>
                <dt className="text-xs text-(--lifeops-muted)">En LifeOps desde</dt>
                <dd className="mt-0.5 text-(--lifeops-fg)">{formatDateShortEsLocal(data.created_at.slice(0, 10))}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-4 text-xs text-(--lifeops-muted)">
            El correo de la cuenta es con el que inicias sesión y no se puede cambiar desde aquí.
          </p>
        </section>
        {aside}
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <DetailCard className="mb-0" title="Tu promotoría" actions={<EditButton label="Editar datos de la promotoría" onClick={() => setEditing("profile")} />}>
          <DetailRows>
            <DetailRow label="Nombre">{profile.officeName || "—"}</DetailRow>
            <DetailRow label="Estado">{stateName || "—"}</DetailRow>
            <DetailRow label="Clave de promotoría">
              {profile.agencyCode ? <span className="font-mono">{profile.agencyCode}</span> : "Sin clave"}
            </DetailRow>
          </DetailRows>
        </DetailCard>

        <DetailCard className="mb-0" title="Contacto" actions={<EditButton label="Editar contacto" onClick={() => setEditing("contacts")} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-(--lifeops-hover)/40 p-4">
              <p className="text-xs text-(--lifeops-muted)">Quién usa LifeOps</p>
              <p className="mt-1 text-sm font-medium text-(--lifeops-fg)">{contacts.fullName || "—"}</p>
              <p className="text-[13px] text-(--lifeops-muted)">{labelOf(JOB_ROLE_OPTIONS, contacts.jobRole) ?? "Sin rol"}</p>
              <p className="mt-2 text-[13px] tabular-nums text-(--lifeops-fg)">
                {contacts.phone ? `+52 ${formatMxPhone(contacts.phone)}` : "Sin teléfono"}
              </p>
            </div>
            <div className="rounded-lg bg-(--lifeops-hover)/40 p-4">
              <p className="text-xs text-(--lifeops-muted)">Dueño(a) de la promotoría</p>
              {ownerIsRegistrant ? (
                <p className="mt-1 text-sm text-(--lifeops-fg)">La misma persona</p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium text-(--lifeops-fg)">{contacts.ownerName || "—"}</p>
                  <p className="mt-2 text-[13px] tabular-nums text-(--lifeops-fg)">
                    {contacts.ownerPhone ? `+52 ${formatMxPhone(contacts.ownerPhone)}` : "Sin teléfono"}
                  </p>
                </>
              )}
            </div>
          </div>
        </DetailCard>

        <DetailCard className="mb-0" title="Tu operación" actions={<EditButton label="Editar operación" onClick={() => setEditing("operation")} />}>
          <DetailRows>
            <DetailRow label="Aseguradoras">
              <Tags items={insurerNames} />
            </DetailRow>
            <DetailRow label="Ramos">
              <Tags items={lineNames} />
            </DetailRow>
            <DetailRow label="Asesores">{labelOf(CONSULTANT_COUNT_RANGE_OPTIONS, operation.consultantCountRange) ?? "—"}</DetailRow>
            <DetailRow label="Pólizas activas">{labelOf(ACTIVE_POLICY_RANGE_OPTIONS, operation.activePolicyRange) ?? "—"}</DetailRow>
            <DetailRow label="Qué quieres resolver primero">{labelOf(PRIMARY_GOAL_OPTIONS, operation.primaryGoal) ?? "—"}</DetailRow>
          </DetailRows>
        </DetailCard>
      </div>

      <SectionDialog
        open={editing === "profile"}
        title="Tu promotoría"
        description="Nombre, estado y clave."
        initial={profile}
        save={saveOfficeProfileAction}
        canSave={profileFilled}
        onClose={close}
        onSaved={async () => {
          // Sidebar shows the promotoría name; the clave locks once saved
          await Promise.all([reloadProfile(), reload()]);
        }}
      >
        {(props) => (
          <OfficeProfileFields {...props} states={catalogs.states} agencyCodeLocked={agencyCodeLocked} autoFocus />
        )}
      </SectionDialog>

      <SectionDialog
        open={editing === "contacts"}
        title="Contacto"
        description="Quién usa LifeOps y quién es el dueño(a)."
        initial={contacts}
        save={saveOfficeContactsAction}
        canSave={contactsFilled}
        onClose={close}
        onSaved={reload}
      >
        {(props) => <OfficeContactsFields {...props} autoFocus />}
      </SectionDialog>

      <SectionDialog
        open={editing === "operation"}
        title="Tu operación"
        description="Aseguradoras, ramos y tamaño de tu cartera."
        initial={operation}
        save={saveOfficeOperationAction}
        canSave={operationFilled}
        onClose={close}
        onSaved={reload}
      >
        {(props) => (
          <OfficeOperationFields {...props} insurers={catalogs.insurers} linesOfBusiness={catalogs.linesOfBusiness} />
        )}
      </SectionDialog>
    </div>
  );
}

/** Perfil (promotoría): what was captured in onboarding, edited section by section. `aside` goes under the identity card. */
export function OfficeSettings({ officeId, aside }: { officeId: string; aside?: ReactNode }) {
  const { data, catalogs, error, loading, reload } = useOfficeOnboarding(officeId);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardSkeleton lines={4} />
        <div className="flex flex-col gap-4 lg:col-span-2">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={5} />
        </div>
      </div>
    );
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
  return <OfficeProfileView data={data} catalogs={catalogs} reload={reload} aside={aside} />;
}
