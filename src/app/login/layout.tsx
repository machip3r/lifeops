import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login - LifeOps",
  description: "Sign in or create your LifeOps account",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
