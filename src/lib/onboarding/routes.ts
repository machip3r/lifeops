/** Where a signed-in user belongs: promotorías finish onboarding before the dashboard. */
export const ONBOARDING_PATH = "/onboarding";

type ProfileLike = { role: "promotory" | "consultant"; onboarding_completed?: boolean };

export function needsOnboarding(profile: ProfileLike): boolean {
  return profile.role === "promotory" && !profile.onboarding_completed;
}

export function homePathFor(profile: ProfileLike): string {
  return needsOnboarding(profile) ? ONBOARDING_PATH : "/dashboard";
}
