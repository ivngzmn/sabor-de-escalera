// OpenUI theme mapped onto the Stitch "Warm Editorial Heritage" tokens, so
// generated UI reads as part of the app. Use it as the single theme owner:
//   <ThemeProvider mode="light" lightTheme={openuiTheme}>…</ThemeProvider>
// and import "@openuidev/react-ui/layered/styles/index.css" once (Tailwind v4).
// The app is light-only, so there is no dark theme yet.
import { createTheme } from "@openuidev/react-ui";

export const openuiTheme = createTheme({
  // Surfaces
  background: "var(--background)",
  foreground: "var(--card)",
  popoverBackground: "var(--popover)",
  sunkLight: "var(--masa-soft)",
  sunk: "var(--muted)",
  sunkDeep: "var(--accent)",
  elevated: "var(--card)",
  overlay: "var(--color-scrim)",
  highlight: "var(--accent)",

  // Text
  textNeutralPrimary: "var(--foreground)",
  textNeutralSecondary: "var(--muted-foreground)",
  textNeutralLink: "var(--primary-ink)",
  textBrand: "var(--primary-ink)",
  textAccentPrimary: "var(--primary-foreground)",
  textSuccessPrimary: "var(--secondary)",
  textDangerPrimary: "var(--destructive)",

  // Interactive states
  interactiveAccentDefault: "var(--primary)",
  interactiveAccentHover: "var(--primary-hover)",
  interactiveAccentPressed: "var(--primary-hover)",
  interactiveDestructiveDefault: "var(--destructive)",

  // Borders
  borderDefault: "var(--border)",
  borderInteractive: "var(--input)",
  borderAccent: "var(--ring)",

  // Chat
  chatUserResponseBg: "var(--accent)",
  chatUserResponseText: "var(--foreground)",

  // Radius steps from DESIGN.md
  radiusS: "var(--radius-accent)",
  radiusM: "var(--radius-control)",
  radiusL: "var(--radius-group)",
  radiusXl: "var(--radius-card)",
  radius2xl: "var(--radius-tile)",
  radiusFull: "var(--radius-pill)",

  // Typography. Only the 400 and 600 faces are loaded, so heavier weights cap
  // at 600. Compound tokens are `font` shorthands and do not follow fontBody.
  fontBody: "var(--font-body)",
  fontHeading: "var(--font-heading)",
  fontLabel: "var(--font-body)",
  fontNumbers: "var(--font-body)",
  fontWeightMedium: "600",
  fontWeightBold: "600",
  fontWeightHeavy: "600",
  textBodySm: "400 .875rem/1.5 var(--font-body)",
  textBodyDefault: "400 1rem/1.6 var(--font-body)",
  textBodyLg: "400 1.125rem/1.56 var(--font-body)",
  textHeadingSm: "600 1.375rem/1.27 var(--font-heading)",
  textHeadingMd: "600 clamp(1.5rem, .75vw + 1.25rem, 1.75rem)/1.29 var(--font-heading)",
  textHeadingLg: "600 clamp(1.75rem, 1.5vw + 1.2rem, 2.25rem)/1.22 var(--font-heading)",
  textHeadingXl: "600 clamp(2.25rem, 2.5vw + 1.25rem, 3rem)/1.17 var(--font-heading)",
  textLabelSm: "600 .6875rem/1.27 var(--font-body)",

  // Warm espresso elevation ladder
  shadowS: "var(--shadow-level-1)",
  shadowM: "var(--shadow-level-2)",
  shadowL: "var(--shadow-level-3)",
});
