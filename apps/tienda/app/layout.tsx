import type { Metadata, Viewport } from "next";
import { Archivo, EB_Garamond, Newsreader } from "next/font/google";
import { Suspense } from "react";
import { AvisoDeLaUrl } from "@/components/cuenta/AvisoDeLaUrl";
import { ProveedorInstalar } from "@/components/instalar/ProveedorInstalar";
import { RecordarPrendaTocada } from "@/components/PrendaTocada";
import { SCRIPT_DEL_AVISO } from "@/lib/instalar";
import "./globals.css";
// Las páginas de la cuenta (crear, entrar, recuperar, «Mi cuenta», privacidad y términos) y el aviso «Listo: …», que también
// sale en la portada al salir de la cuenta.
import "./estilos/cuenta.css";
// La tarjeta de una prenda, su foto o su silueta, y la cabecera de quien tiene cuenta (actividad 5: el menú, el buscador y el menú
// «Ropa», con las fotos de las prendas). Salen en el Inicio, el catálogo, la ficha, «Mi cuenta» y las páginas de ayuda.
import "./estilos/catalogo.css";
import "./estilos/cabecera.css";
// Instalar CAYLA en el celular (ADR-0431): la hoja, la guía, la franja, la tarjeta tras separar y la fila de «Mi perfil».
import "./estilos/instalar.css";
// El paso de una vista a otra: el fundido, lo fijo que no se mueve y la foto que viaja a la ficha (components/Vistas.tsx).
import "./estilos/vistas.css";

// Las letras de la dirección «A · Muro» (Felipe 2026-10-17, docs/maquetas/tienda-rediseno-2026-10/a-muro.html): Archivo para todo el texto
// y, ensanchada (eje `wdth` hasta 125), para los títulos en mayúsculas, como la señalética de una galería; Newsreader en cursiva para el
// nombre de cada prenda, como la cédula de una obra; EB Garamond queda solo en la palabra CAYLA del logo (la marca no se rediseña).
const sans = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const nombre = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-newsreader", display: "swap" });
const marca = EB_Garamond({ subsets: ["latin"], weight: ["500"], variable: "--font-eb-garamond", display: "swap" });

export const metadata: Metadata = {
  title: "CAYLA · Tienda online",
  description: "Separa tus prendas de CAYLA y recógelas en tu tienda.",
  // Instalada en el iPhone (ADR-0431): abre en pantalla completa, con su nombre y su ícono. El manifiesto (`app/manifest.ts`) es el de Android.
  appleWebApp: { capable: true, title: "CAYLA", statusBarStyle: "default" },
  icons: { apple: "/cayla-apple-180.png" },
};

// El color de la barra del navegador en el celular: el crema del tema claro y el fondo del oscuro (los de globals.css).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ecebe7" },
    { media: "(prefers-color-scheme: dark)", color: "#161615" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${sans.variable} ${nombre.variable} ${marca.variable}`}>
      <head>
        {/* Guarda el aviso de instalar de Chrome si llega antes de que la página se arme (ADR-0431): llega una sola vez. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DEL_AVISO }} />
      </head>
      <body>
        <ProveedorInstalar>{children}</ProveedorInstalar>
        {/* Al tocar una prenda, guarda lo que su tarjeta ya mostraba: la ficha llega con eso (lib/prenda-tocada.ts). */}
        <RecordarPrendaTocada />
        {/* Lee la dirección en el navegador: en una página guardada en caché (la portada) va dentro de su Suspense. */}
        <Suspense fallback={null}>
          <AvisoDeLaUrl />
        </Suspense>
      </body>
    </html>
  );
}
