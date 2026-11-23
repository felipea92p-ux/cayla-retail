import type { Metadata, Viewport } from "next";
import { EB_Garamond, DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Avisos } from "@/components/ui/Avisos";
import { AvisoDestacado } from "@/components/ui/AvisoDestacado";
import { EsperaGlobal } from "@/components/ui/Espera";
import { PaginaEstable } from "@/components/ui/PaginaEstable";
import { OndaBotones } from "@/components/ui/OndaBotones";
import { MarcaDeVentana } from "@/components/impresion/MarcaDeVentana";
import { FilasQueSeDeslizan } from "@/components/ui/FilasQueSeDeslizan";
import { NotasQueCrecen } from "@/components/ui/NotasQueCrecen";
import { SesionEntrePestanas } from "@/components/ui/SesionEntrePestanas";
import { EntradaColibri } from "@/components/login/EntradaColibri";
import { SCRIPT_TEMA_ANTES_DE_PINTAR } from "@/lib/tema-reglas";
import { SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR } from "@/lib/movimiento-reglas";
import { SCRIPT_LIVIANO_ANTES_DE_PINTAR } from "@/lib/liviano-reglas";
import { SCRIPT_NAVEGADOR_VIEJO } from "@/lib/navegador-viejo-reglas";
import { AvisoNavegadorViejo } from "@/components/AvisoNavegadorViejo";

// Las dos familias del sistema CAYLA (brandbook v3.0): EB Garamond es "el alma"
// (títulos, cifras hero), DM Sans es "el sistema" (interfaz, cuerpo, etiquetas).
const serif = EB_Garamond({ subsets: ["latin"], variable: "--font-eb-garamond", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });
// Las cifras de DM Sans en Inter (ADR-0694, act. 2026-11-23): DM Sans no trae cifras tabulares y una columna de montos no alineaba.
// Es un recorte con solo los dígitos 0–9 (7 KB, `fuentes/inter-cifras.woff2`, licencia OFL al lado): va delante de DM Sans en
// `--font-sans` y el navegador lo usa solo para los dígitos; letras, signos y la Garamond no cambian. Sin fuente de respaldo
// (`adjustFontFallback: false`): next/font la haría de Arial, sin `unicode-range`, y se quedaría con todas las letras.
const cifras = localFont({
  src: "./fuentes/inter-cifras.woff2",
  variable: "--font-cifras",
  display: "swap",
  weight: "100 900",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0030-0039" }],
});

export const metadata: Metadata = {
  // Raya larga con espacios, igual que «Dynamic — CAYLA»: las dos pestañas se leen como una familia.
  title: "Retail — CAYLA",
  description: "Donde el estilo transforma.",
  // Los íconos NO se declaran acá: Next los toma por convención de archivo
  // (app/favicon.ico, app/icon.png, app/apple-icon.png). Un `icons` manual convivía
  // con el favicon.ico de plantilla (el triángulo de Vercel) y el navegador elegía
  // el equivocado.
  // Instalado en el iPhone (ADR-0582): se abre sin la barra de Safari y con este nombre bajo el ícono.
  appleWebApp: { capable: true, title: "CAYLA ERP", statusBarStyle: "default" },
};

// `viewport-fit=cover` (ADR-0479, actividad 9): la página llega hasta los bordes del iPhone, con el fondo crema bajo la isla, la
// muesca de lado y la barrita de abajo. Sin esto Safari dejaba esos bordes en blanco y todo `env(safe-area-inset-*)` valía 0. Lo que
// se toca vive dentro: la cabecera, el lateral, el contenido, las barras fijas y las hojas se apartan solos (AppShell, Modal, Cajon).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning`: los scripts de abajo ponen `data-tema`, `data-movimiento`, `data-liviano` y `data-navegador-viejo` en <html> antes de que React hidrate (ADR-0336).
    <html lang="es" className={`${serif.variable} ${sans.variable} ${cifras.variable}`} suppressHydrationWarning>
      <head>
        {/* El tema guardado se aplica ANTES de la primera pintura: sin esto, quien eligió oscuro vería un destello claro en cada carga. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_ANTES_DE_PINTAR }} />
        {/* Las animaciones, igual (ADR-0625): quieto salvo que este aparato las haya encendido; sin esto, la primera hoja se animaría. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_MOVIMIENTO_ANTES_DE_PINTAR }} />
        {/* El modo liviano (ADR-0674): en un equipo lento, macizo desde la primera pintura; sin esto se pintaría con vidrio y después cambiaría. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_LIVIANO_ANTES_DE_PINTAR }} />
        {/* «Actualiza el navegador» (ADR-0674): si no entiende `color-mix()`, marca <html> y el aviso de arriba del <body> se muestra. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_NAVEGADOR_VIEJO }} />
      </head>
      <body className="antialiased">
        {/* Escondido salvo en un navegador que no puede pintar el ERP (ADR-0674): HTML del servidor, sin JavaScript. */}
        <AvisoNavegadorViejo />
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
        {/* La marca de los íconos «CAYLA Caja» / «CAYLA Etiquetas» (`?ventana=`): una vez, acá, para que también valga si el ícono cae en el login. */}
        <MarcaDeVentana />
        {/* Las filas de pestañas o de píldoras que se deslizan avisan que hay más con un degradado en el borde (Felipe 2026-10-23, ADR-0358): una vez, acá, para todas. */}
        <FilasQueSeDeslizan />
        {/* Las notas crecen mientras se escribe, sin cambiar cómo se ven vacías (2026-11-18): una vez, acá, para todo <textarea>. */}
        <NotasQueCrecen />
        {/* Una cuenta por navegador (ADR-0309): si otra pestaña cambia de cuenta, esta se va sola al login o al inicio. */}
        <SesionEntrePestanas />
        {/* La entrada al ERP (Felipe 2026-10-13): el colibrí que cruza al centro y se abre sobre la pantalla de destino. Una vez, acá, para que sobreviva a la navegación del login. */}
        <EntradaColibri />
      </body>
    </html>
  );
}
