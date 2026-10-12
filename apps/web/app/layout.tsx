import type { Metadata } from "next";
import { EB_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import { Avisos } from "@/components/ui/Avisos";
import { AvisoDestacado } from "@/components/ui/AvisoDestacado";
import { EsperaGlobal } from "@/components/ui/Espera";
import { PaginaEstable } from "@/components/ui/PaginaEstable";
import { OndaBotones } from "@/components/ui/OndaBotones";
import { SesionEntrePestanas } from "@/components/ui/SesionEntrePestanas";
import { SCRIPT_TEMA_ANTES_DE_PINTAR } from "@/lib/tema-reglas";

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
    // `suppressHydrationWarning`: el script de abajo pone `data-tema` en <html> antes de que React hidrate (ADR-0336).
    <html lang="es" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        {/* El tema guardado se aplica ANTES de la primera pintura: sin esto, quien eligió oscuro vería un destello claro en cada carga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_ANTES_DE_PINTAR }} />
      </head>
      <body className="antialiased">
        {children}
        {/* Avisos globales (arriba a la derecha): montado una sola vez, acá,
            para que valga también en /login y sobreviva a la navegación. */}
        <Avisos />
        {/* La confirmación grande y centrada (hoy, bajar al piso): una vez, acá, para que sobreviva al refresco que sigue al guardado. */}
        <AvisoDestacado />
        {/* El loader general (ADR-0149): una vez, acá, para que valga en toda la app y también en /login. */}
        <EsperaGlobal />
        {/* La página no se encoge bajo el mouse (ADR-0185): una vez, acá, para toda la app y sus ventanas. */}
        <PaginaEstable />
        {/* La onda de un clic en un botón (ADR-0358, ronda 4): una vez, acá, para todos los botones del ERP. */}
        <OndaBotones />
        {/* Una cuenta por navegador (ADR-0309): si otra pestaña cambia de cuenta, esta se va sola al login o al inicio. */}
        <SesionEntrePestanas />
      </body>
    </html>
  );
}
