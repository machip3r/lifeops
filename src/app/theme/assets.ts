/**
 * Asset paths and configuration for LifeOps
 * Update these paths when assets are moved or renamed
 */

export const assets = {
  // SVG Icons
  icons: {
    file: "/file.svg",
    globe: "/globe.svg",
    next: "/next.svg",
    vercel: "/vercel.svg",
    window: "/window.svg",
  },

  // Images (add your image paths here)
  images: {
    logo: "/logo.png", // Example - update with actual logo path
    favicon: "/favicon.ico",
  },

  // Fonts
  fonts: {
    lexend: "/assets/fonts/Lexend",
    inter: "/assets/fonts/Inter",
  },

  // Brand assets
  brand: {
    name: "LifeOps",
    tagline: "Streamline Your Life Operations",
  },
} as const;

