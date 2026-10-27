import type { OfficeOnboarding } from "@/lib/db";
import {
  OTHER_CODE,
  type ActivePolicyRange,
  type ConsultantCountRange,
  type JobRole,
  type PrimaryGoal,
} from "@/lib/onboarding/options";

/** Controlled form values for the three onboarding sections (also edited in Perfil). */

export type OfficeProfileValues = {
  officeName: string;
  stateCode: string;
  agencyCode: string;
};

export type OfficeContactsValues = {
  fullName: string;
  jobRole: JobRole | null;
  phone: string;
  ownerName: string;
  ownerPhone: string;
};

export type OfficeOperationValues = {
  insurerCodes: string[];
  otherInsurer: string;
  lineCodes: string[];
  consultantCountRange: ConsultantCountRange | null;
  activePolicyRange: ActivePolicyRange | null;
  primaryGoal: PrimaryGoal | null;
};

export function toProfileValues(data: OfficeOnboarding | null): OfficeProfileValues {
  const name = data?.name?.trim() ?? "";
  return {
    // Old signups stored the correo as a placeholder name
    officeName: name && name !== data?.email ? name : "",
    stateCode: data?.state_code ?? "",
    agencyCode: data?.agency_code ?? "",
  };
}

export function toContactsValues(data: OfficeOnboarding | null): OfficeContactsValues {
  const registrant = data?.contacts.find((c) => c.kind === "REGISTRANT");
  const owner = data?.contacts.find((c) => c.kind === "OWNER");
  return {
    fullName: registrant?.full_name ?? "",
    jobRole: (registrant?.job_role as JobRole | undefined) ?? null,
    phone: registrant?.phone ?? "",
    ownerName: owner?.full_name ?? "",
    ownerPhone: owner?.phone ?? "",
  };
}

export function toOperationValues(data: OfficeOnboarding | null): OfficeOperationValues {
  return {
    insurerCodes: data?.insurers.map((i) => i.insurer_code) ?? [],
    otherInsurer: data?.insurers.find((i) => i.insurer_code === OTHER_CODE)?.other_name ?? "",
    lineCodes: data?.lineCodes ?? [],
    consultantCountRange: (data?.consultant_count_range as ConsultantCountRange | null) ?? null,
    activePolicyRange: (data?.active_policy_range as ActivePolicyRange | null) ?? null,
    primaryGoal: (data?.primary_goal as PrimaryGoal | null) ?? null,
  };
}

/** Required fields filled (enables the submit button; the server schema stays authoritative). */
export function profileFilled(v: OfficeProfileValues): boolean {
  return Boolean(v.officeName.trim() && v.stateCode);
}

export function contactsFilled(v: OfficeContactsValues): boolean {
  const phoneOk = (phone: string) => phone.replace(/\D/g, "").length === 10;
  if (!v.fullName.trim() || !v.jobRole || !phoneOk(v.phone)) return false;
  return v.jobRole === "OWNER" || Boolean(v.ownerName.trim() && phoneOk(v.ownerPhone));
}

export function operationFilled(v: OfficeOperationValues): boolean {
  if (v.insurerCodes.length === 0 || v.lineCodes.length === 0) return false;
  if (v.insurerCodes.includes(OTHER_CODE) && !v.otherInsurer.trim()) return false;
  return Boolean(v.consultantCountRange && v.activePolicyRange);
}

/** Last saved step → step to show (0-based) when the promotoría comes back. */
export function resumeStep(data: OfficeOnboarding | null): number {
  return Math.min(data?.onboarding_step ?? 0, 2);
}
