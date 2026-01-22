/**
 * Color theme configuration for LifeOps
 * Color palette: #FBDBAC (cream), #5D6C7A (dark blue-gray), #000000 (black), #FFFFFF (white)
 */

export const colors = {
  // Primary colors (Cream/Beige - #FBDBAC)
  primary: {
    50: '#FEF9F3',
    100: '#FDF3E7',
    200: '#FCE7CF',
    300: '#FADBB7',
    400: '#FBCF9F',
    500: '#FBDBAC',
    600: '#E8C89B',
    700: '#D5B58A',
    800: '#C2A279',
    900: '#AF8F68',
  },

  // Secondary colors (Dark Blue-Gray - #5D6C7A)
  secondary: {
    50: '#F5F6F7',
    100: '#EBEDF0',
    200: '#D7DBE0',
    300: '#C3C9D1',
    400: '#AFB7C2',
    500: '#9BA5B3',
    600: '#5D6C7A',
    700: '#4A5561',
    800: '#373E48',
    900: '#24272F',
  },

  // Accent colors (using primary variations)
  accent: {
    50: '#FEF9F3',
    100: '#FDF3E7',
    200: '#FCE7CF',
    300: '#FADBB7',
    400: '#FBCF9F',
    500: '#FBDBAC',
    600: '#E8C89B',
    700: '#D5B58A',
    800: '#C2A279',
    900: '#AF8F68',
  },

  // Neutral/Gray colors (using secondary - dark blue-gray)
  gray: {
    50: '#F5F6F7',
    100: '#EBEDF0',
    200: '#D7DBE0',
    300: '#C3C9D1',
    400: '#AFB7C2',
    500: '#9BA5B3',
    600: '#5D6C7A',
    700: '#4A5561',
    800: '#373E48',
    900: '#24272F',
  },

  // Background colors
  background: {
    light: '#1a1d24', // Dark blue-gray background (not pure black)
    dark: '#1a1d24',
    lightSecondary: '#2a2f38', // Used for cards
    darkSecondary: '#2a2f38', // Used for cards
  },

  // Navbar colors
  navbar: {
    background: '#242830', // Slightly lighter than background
    border: '#2a2f38',
  },

  // Table colors
  table: {
    header: '#2a2f38',
    row: '#242830',
    rowHover: '#2f3540',
    border: '#3a4049',
  },

  // Text colors
  text: {
    light: '#FFFFFF', // White text on black background
    dark: '#FFFFFF', // White text on black background
    lightSecondary: '#FBDBAC', // Cream for secondary text
    darkSecondary: '#FBDBAC', // Cream for secondary text
  },

  // Card colors
  card: {
    background: '#5D6C7A',
    text: '#FFFFFF',
  },

  // Status colors (using secondary for consistency)
  success: '#5D6C7A',
  warning: '#E8C89B',
  error: '#C2A279',
  info: '#5D6C7A',
} as const;

