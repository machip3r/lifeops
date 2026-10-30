---
version: 1
slug: "src-app-login-page-tsx"
primary_target: "src/app/login/page.tsx"
related_targets: ["src/app/login/layout.tsx"]
---

## Scope and visitor mode
Authentication entry at `/login`. Operate.

## Audience and action
Invited promotorías and asesores signing into an existing account. The primary action is to sign in; prospective promotorías can request a demo through the landing page.

## Proof and constraints
LifeOps accounts are invitation-only. Do not expose registration. Preserve email verification, resend, validation, loading, error, and redirect behavior. Use the shared LifeOps theme tokens, Lexend headings, Inter interface text, and auth form controls. Use the supplied `public/assets/images/consultants-1.jpeg` photo with descriptive alt text.

## Direction and memorable moment
Desktop uses a two-column composition: a focused sign-in panel beside a photograph of consultants explaining a whiteboard to clients. On mobile, keep the form as the only foreground content and fade the photo into the page background with the brand colors.

## Visitor path
Recognize LifeOps → sign in with invited credentials → verify email when needed → continue to onboarding or dashboard. Visitors without access can request a demo.

## Unresolved decisions
None.
