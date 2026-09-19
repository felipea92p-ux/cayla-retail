import type { Metadata } from "next";
import { EB_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { Avisos } from "@/components/ui/Avisos";

// Las dos familias del sistema CAYLA (brandbook v3.0): EB Garamond es "el alma"
// (títulos, cifras hero), DM Sans es "el sistema" (interfaz, cuerpo, etiquetas).
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  // Raya larga con espacios, igual que «Dynamic — CAYLA»: las dos pestañas se leen como una familia.
  title: "Retail — CAYLA",
  description: "Donde el estilo transforma.",
  // Los íconos NO se declaran acá: Next los toma por convención de archivo
  // (app/favicon.ico, app/icon.png, app/apple-icon.png). Un `icons` manual convivía
  // con el favicon.ico de plantilla (el triángulo de Vercel) y el navegador elegía
  // el equivocado.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable}`}>
      <body className="antialiased">
        {children}
        {/* Avisos globales (arriba a la derecha): montado una sola vez, acá,
            para que valga también en /login y sobreviva a la navegación. */}
        <Avisos />
      </body>
    </html>
  );
}
