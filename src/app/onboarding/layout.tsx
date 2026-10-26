import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registro - LifeOps",
  description: "Cuéntanos de tu promotoría para preparar LifeOps",
};

export default function OnboardingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
