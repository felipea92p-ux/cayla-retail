import type { Metadata, Viewport } from "next";
import { EB_Garamond, DM_Sans } from "next/font/google";
import { Suspense } from "react";
import { AvisoDeLaUrl } from "@/components/cuenta/AvisoDeLaUrl";
import "./globals.css";
// Las páginas de la cuenta (crear, entrar, recuperar, «Mi cuenta», privacidad y términos) y el aviso «Listo: …», que también
// sale en la portada al salir de la cuenta.
import "./estilos/cuenta.css";
// La tarjeta de una prenda, su foto o su silueta, y la cabecera de quien tiene cuenta (actividad 5: el menú, el buscador y el menú
// «Ropa», con las fotos de las prendas). Salen en el Inicio, el catálogo, la ficha, «Mi cuenta» y las páginas de ayuda.
import "./estilos/catalogo.css";
import "./estilos/cabecera.css";

// Las mismas dos letras del ERP y de la marca: EB Garamond para títulos, DM Sans para el texto.
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: "CAYLA · Tienda online",
  description: "Separa tus prendas de CAYLA y recógelas en tu tienda.",
};

// El color de la barra del navegador en el celular: el crema del tema claro y el fondo del oscuro (los de globals.css).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a18" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable}`}>
      <body>
        {children}
        {/* Lee la dirección en el navegador: en una página guardada en caché (la portada) va dentro de su Suspense. */}
        <Suspense fallback={null}>
          <AvisoDeLaUrl />
        </Suspense>
      </body>
    </html>
  );
}
