import type { Metadata } from "next";
import { lexend, inter } from "./theme/fonts";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";
import { ThemeProvider, themeInitScript } from "@/contexts/theme-context";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "LifeOps - Streamline Your Life Operations",
  description:
    "Powerful tools to streamline your daily operations and boost productivity",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${lexend.variable} ${inter.variable} antialiased`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
