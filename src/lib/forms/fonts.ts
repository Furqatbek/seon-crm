// The eight fonts a form may use, loaded through next/font for the editor
// (the live sample and the preview). The public page loads the chosen one itself.
// docs/SPEC.md → "Lead forms add-on → Defaults to confirm → Fonts".

import { Inter, Manrope, Montserrat, Nunito, Open_Sans, PT_Sans, Roboto, Rubik } from "next/font/google";

import type { FormFont } from "./document";

// latin-ext carries ʻ (U+02BB) for Uzbek; cyrillic is for Russian.
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const roboto = Roboto({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const openSans = Open_Sans({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const ptSans = PT_Sans({ weight: ["400", "700"], subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });
const rubik = Rubik({ subsets: ["latin", "latin-ext", "cyrillic"], display: "swap", preload: false });

/** Each font's CSS font-family as next/font named it. */
export const FONT_FAMILY: Record<FormFont, string> = {
  Inter: inter.style.fontFamily,
  Manrope: manrope.style.fontFamily,
  Montserrat: montserrat.style.fontFamily,
  Roboto: roboto.style.fontFamily,
  "Open Sans": openSans.style.fontFamily,
  "PT Sans": ptSans.style.fontFamily,
  Nunito: nunito.style.fontFamily,
  Rubik: rubik.style.fontFamily,
};
