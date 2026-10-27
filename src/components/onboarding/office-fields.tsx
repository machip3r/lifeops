"use client";

import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { UnsupportedInsurerNotice } from "@/components/onboarding/unsupported-insurer-notice";
import type {
  OfficeContactsValues,
  OfficeOperationValues,
  OfficeProfileValues,
} from "@/lib/onboarding/form";
import {
  ACTIVE_POLICY_RANGE_OPTIONS,
  CONSULTANT_COUNT_RANGE_OPTIONS,
  JOB_ROLE_OPTIONS,
  lacksSupportedInsurer,
  OTHER_CODE,
  PRIMARY_GOAL_OPTIONS,
} from "@/lib/onboarding/options";
import type { CatalogOption } from "@/lib/supabase";
import { filterCode, filterEntityName, filterPersonName } from "@/lib/validation/input-filters";
import { LIMITS } from "@/lib/validation/schemas";

/** Field groups shared by the onboarding stepper and Perfil. Inputs drop invalid characters as you type. */

type Errors = Record<string, string>;

type SectionProps<T> = {
  values: T;
  onChange: (patch: Partial<T>) => void;
  errors: Errors;
  disabled?: boolean;
  /** Focus the first field (onboarding step change) */
  autoFocus?: boolean;
};

export function OfficeProfileFields({
  values,
  onChange,
  errors,
  disabled,
  autoFocus,
  states,
  agencyCodeLocked,
}: SectionProps<OfficeProfileValues> & { states: CatalogOption[]; agencyCodeLocked: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Nombre de la promotoría o agencia" htmlFor="office-name" variant="auth" error={errors.officeName}>
        <Input
          id="office-name"
          value={values.officeName}
          onChange={(e) => onChange({ officeName: filterEntityName(e.target.value) })}
          maxLength={LIMITS.entityName}
          autoCapitalize="words"
          autoComplete="organization"
          placeholder="Ej. Promotoría Rivera"
          disabled={disabled}
          autoFocus={autoFocus}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Estado" htmlFor="office-state" variant="auth" error={errors.stateCode}>
          <Select
            id="office-state"
            value={values.stateCode}
            onChange={(e) => onChange({ stateCode: e.target.value })}
            disabled={disabled}
          >
            <option value="">Selecciona tu estado</option>
            {states.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Clave de promotoría (opcional)"
          htmlFor="office-agency-code"
          variant="auth"
          error={errors.agencyCode}
          hint={
            agencyCodeLocked
              ? "Ya no se puede cambiar. Escríbenos si necesitas corregirla."
              : "Al terminar el registro ya no se podrá cambiar."
          }
        >
          <Input
            id="office-agency-code"
            value={values.agencyCode}
            onChange={(e) => onChange({ agencyCode: filterCode(e.target.value) })}
            maxLength={LIMITS.agencyCode}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej. P-1234"
            disabled={disabled || agencyCodeLocked}
          />
        </FormField>
      </div>
    </div>
  );
}

export function OfficeContactsFields({
  values,
  onChange,
  errors,
  disabled,
  autoFocus,
}: SectionProps<OfficeContactsValues>) {
  const askOwner = values.jobRole !== null && values.jobRole !== "OWNER";
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Tu nombre completo" htmlFor="contact-name" variant="auth" error={errors.fullName}>
          <Input
            id="contact-name"
            value={values.fullName}
            onChange={(e) => onChange({ fullName: filterPersonName(e.target.value) })}
            maxLength={LIMITS.personName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Nombre y apellidos"
            disabled={disabled}
            autoFocus={autoFocus}
          />
        </FormField>

        <FormField
          label="Teléfono o WhatsApp"
          htmlFor="contact-phone"
          variant="auth"
          error={errors.phone}
          hint="Solo para darte soporte."
        >
          <PhoneInput
            id="contact-phone"
            value={values.phone}
            onChange={(phone) => onChange({ phone })}
            disabled={disabled}
          />
        </FormField>
      </div>

      <ChoiceGroup
        variant="chips"
        legend="Tu rol en la promotoría"
        options={JOB_ROLE_OPTIONS}
        value={values.jobRole}
        onChange={(jobRole) => onChange({ jobRole })}
        error={errors.jobRole}
        disabled={disabled}
      />

      {askOwner ? (
        <div className="flex flex-col gap-4 rounded-lg border-2 border-(--lifeops-border) p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-sm text-(--lifeops-muted)">¿Quién es el dueño o la dueña de la promotoría?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nombre del dueño(a)" htmlFor="owner-name" variant="auth" error={errors.ownerName}>
              <Input
                id="owner-name"
                value={values.ownerName}
                onChange={(e) => onChange({ ownerName: filterPersonName(e.target.value) })}
                maxLength={LIMITS.personName}
                autoCapitalize="words"
                placeholder="Nombre y apellidos"
                disabled={disabled}
              />
            </FormField>
            <FormField label="Teléfono del dueño(a)" htmlFor="owner-phone" variant="auth" error={errors.ownerPhone}>
              <PhoneInput
                id="owner-phone"
                value={values.ownerPhone}
                onChange={(ownerPhone) => onChange({ ownerPhone })}
                disabled={disabled}
              />
            </FormField>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OfficeOperationFields({
  values,
  onChange,
  errors,
  disabled,
  insurers,
  linesOfBusiness,
}: SectionProps<OfficeOperationValues> & {
  insurers: CatalogOption[];
  linesOfBusiness: CatalogOption[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ChoiceGroup
        multiple
        variant="chips"
        legend="Aseguradoras con las que trabajas"
        hint="Elige todas las que apliquen."
        options={insurers.map((i) => ({ value: i.code, label: i.name }))}
        value={values.insurerCodes}
        onChange={(insurerCodes) => onChange({ insurerCodes })}
        error={errors.insurerCodes}
        disabled={disabled}
      />
      {values.insurerCodes.includes(OTHER_CODE) ? (
        <FormField label="¿Qué otra aseguradora?" htmlFor="other-insurer" variant="auth" error={errors.otherInsurer}>
          <Input
            id="other-insurer"
            value={values.otherInsurer}
            onChange={(e) => onChange({ otherInsurer: filterEntityName(e.target.value) })}
            maxLength={LIMITS.insurerName}
            autoCapitalize="words"
            disabled={disabled}
          />
        </FormField>
      ) : null}
      {lacksSupportedInsurer(values.insurerCodes) ? (
        <UnsupportedInsurerNotice
          insurerCodes={values.insurerCodes}
          insurers={insurers}
          otherInsurer={values.otherInsurer}
        />
      ) : null}

      <ChoiceGroup
        multiple
        variant="chips"
        legend="Ramos principales"
        options={linesOfBusiness.map((l) => ({ value: l.code, label: l.name }))}
        value={values.lineCodes}
        onChange={(lineCodes) => onChange({ lineCodes })}
        error={errors.lineCodes}
        disabled={disabled}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <ChoiceGroup
          variant="chips"
          legend="¿Cuántos asesores tienes?"
          options={CONSULTANT_COUNT_RANGE_OPTIONS}
          value={values.consultantCountRange}
          onChange={(consultantCountRange) => onChange({ consultantCountRange })}
          error={errors.consultantCountRange}
          disabled={disabled}
        />

        <ChoiceGroup
          variant="chips"
          legend="¿Cuántas pólizas activas manejan?"
          options={ACTIVE_POLICY_RANGE_OPTIONS}
          value={values.activePolicyRange}
          onChange={(activePolicyRange) => onChange({ activePolicyRange })}
          error={errors.activePolicyRange}
          disabled={disabled}
        />
      </div>

      <ChoiceGroup
        variant="chips"
        legend="¿Qué quieres resolver primero? (opcional)"
        options={PRIMARY_GOAL_OPTIONS}
        value={values.primaryGoal}
        onChange={(primaryGoal) => onChange({ primaryGoal })}
        disabled={disabled}
      />
    </div>
  );
}
