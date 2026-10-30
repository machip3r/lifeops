import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión | LifeOps",
  description: "Inicia sesión en tu cuenta de LifeOps.",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
