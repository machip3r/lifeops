/**
 * Font configuration for LifeOps
 * Update these values to change fonts across the application
 *
 * Lexend: Used for titles and headings
 * Inter: Used for body text and paragraphs
 */

import localFont from "next/font/local";

// Lexend font for titles and headings
// Only keeping essential weights: Regular, Medium, SemiBold, Bold
export const lexend = localFont({
  src: [
    {
      path: "../../../public/assets/fonts/Lexend/Lexend-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Lexend/Lexend-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Lexend/Lexend-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Lexend/Lexend-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-lexend",
  display: "swap",
});

// Inter font for body text
// Only keeping essential weights: Regular, Medium, SemiBold, Bold (with italic variants)
export const inter = localFont({
  src: [
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    // Italic variants
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-Italic.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-MediumItalic.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-SemiBoldItalic.ttf",
      weight: "600",
      style: "italic",
    },
    {
      path: "../../../public/assets/fonts/Inter/Inter_18pt-BoldItalic.ttf",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

