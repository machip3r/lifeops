import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accept Invitation - LifeOps",
  description: "Accept your invitation and create your LifeOps account",
};

export default function InviteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
