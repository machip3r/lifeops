import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aceptar invitación - LifeOps",
  description: "Acepta tu invitación y crea tu cuenta en LifeOps",
};

export default function InviteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
