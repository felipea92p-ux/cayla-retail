import type { Metadata } from "next";
import { EB_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

// Las dos familias del sistema CAYLA (brandbook v3.0): EB Garamond es "el alma"
// (títulos, cifras hero), DM Sans es "el sistema" (interfaz, cuerpo, etiquetas).
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "CAYLA",
  description: "Donde el estilo transforma.",
  icons: { icon: "/cayla-isotipo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
