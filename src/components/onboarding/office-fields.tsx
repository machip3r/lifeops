"use client";

import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
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
import { LIMITS } from "@/lib/validation/schemas";

/** Field groups shared by the onboarding stepper and Perfil. */

type Errors = Record<string, string>;

type SectionProps<T> = {
  values: T;
  onChange: (patch: Partial<T>) => void;
  errors: Errors;
  disabled?: boolean;
};

const PHONE_MAX = 16;

export function OfficeProfileFields({
  values,
  onChange,
  errors,
  disabled,
  states,
  agencyCodeLocked,
}: SectionProps<OfficeProfileValues> & { states: CatalogOption[]; agencyCodeLocked: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Nombre de la promotoría o agencia" htmlFor="office-name" variant="auth" error={errors.officeName}>
        <Input
          id="office-name"
          value={values.officeName}
          onChange={(e) => onChange({ officeName: e.target.value })}
          maxLength={LIMITS.entityName}
          autoCapitalize="words"
          autoComplete="organization"
          placeholder="Ej. Promotoría Rivera"
          disabled={disabled}
        />
      </FormField>

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
            ? "La clave ya no se puede cambiar. Escríbenos si necesitas corregirla."
            : "Una vez que termines el registro ya no se podrá cambiar."
        }
      >
        <Input
          id="office-agency-code"
          value={values.agencyCode}
          onChange={(e) => onChange({ agencyCode: e.target.value })}
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          pattern="[A-Za-z0-9][A-Za-z0-9._\/\-]*"
          disabled={disabled || agencyCodeLocked}
        />
      </FormField>
    </div>
  );
}

export function OfficeContactsFields({
  values,
  onChange,
  errors,
  disabled,
}: SectionProps<OfficeContactsValues>) {
  const askOwner = values.jobRole !== null && values.jobRole !== "OWNER";
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Tu nombre completo" htmlFor="contact-name" variant="auth" error={errors.fullName}>
        <Input
          id="contact-name"
          value={values.fullName}
          onChange={(e) => onChange({ fullName: e.target.value })}
          maxLength={LIMITS.personName}
          autoCapitalize="words"
          autoComplete="name"
          disabled={disabled}
        />
      </FormField>

      <ChoiceGroup
        legend="Tu rol en la promotoría"
        options={JOB_ROLE_OPTIONS}
        value={values.jobRole}
        onChange={(jobRole) => onChange({ jobRole })}
        error={errors.jobRole}
        disabled={disabled}
      />

      <FormField
        label="Teléfono o WhatsApp"
        htmlFor="contact-phone"
        variant="auth"
        error={errors.phone}
        hint="10 dígitos. Lo usamos solo para darte soporte."
      >
        <Input
          id="contact-phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          maxLength={PHONE_MAX}
          autoComplete="tel-national"
          placeholder="33 1234 5678"
          disabled={disabled}
        />
      </FormField>

      {askOwner ? (
        <div className="flex flex-col gap-5 rounded-lg border-2 border-(--lifeops-border) p-4">
          <p className="text-sm text-(--lifeops-muted)">¿Quién es el dueño o la dueña de la promotoría?</p>
          <FormField label="Nombre del dueño(a)" htmlFor="owner-name" variant="auth" error={errors.ownerName}>
            <Input
              id="owner-name"
              value={values.ownerName}
              onChange={(e) => onChange({ ownerName: e.target.value })}
              maxLength={LIMITS.personName}
              autoCapitalize="words"
              disabled={disabled}
            />
          </FormField>
          <FormField label="Teléfono del dueño(a)" htmlFor="owner-phone" variant="auth" error={errors.ownerPhone}>
            <Input
              id="owner-phone"
              type="tel"
              inputMode="tel"
              value={values.ownerPhone}
              onChange={(e) => onChange({ ownerPhone: e.target.value })}
              maxLength={PHONE_MAX}
              placeholder="33 1234 5678"
              disabled={disabled}
            />
          </FormField>
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
            onChange={(e) => onChange({ otherInsurer: e.target.value })}
            maxLength={80}
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
        legend="Ramos principales"
        options={linesOfBusiness.map((l) => ({ value: l.code, label: l.name }))}
        value={values.lineCodes}
        onChange={(lineCodes) => onChange({ lineCodes })}
        error={errors.lineCodes}
        disabled={disabled}
        columns={3}
      />

      <ChoiceGroup
        legend="¿Cuántos asesores tienes?"
        options={CONSULTANT_COUNT_RANGE_OPTIONS}
        value={values.consultantCountRange}
        onChange={(consultantCountRange) => onChange({ consultantCountRange })}
        error={errors.consultantCountRange}
        disabled={disabled}
        columns={3}
      />

      <ChoiceGroup
        legend="¿Cuántas pólizas activas manejan?"
        options={ACTIVE_POLICY_RANGE_OPTIONS}
        value={values.activePolicyRange}
        onChange={(activePolicyRange) => onChange({ activePolicyRange })}
        error={errors.activePolicyRange}
        disabled={disabled}
        columns={3}
      />

      <ChoiceGroup
        legend="¿Qué quieres resolver primero? (opcional)"
        options={PRIMARY_GOAL_OPTIONS}
        value={values.primaryGoal}
        onChange={(primaryGoal) => onChange({ primaryGoal })}
        disabled={disabled}
      />
    </div>
  );
}
