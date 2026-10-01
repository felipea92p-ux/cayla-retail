import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import { connection } from "next/server";
import { RegistroClub } from "@/components/clientas/RegistroClub";
import { AvisoClub, HojaClub } from "@/components/clientas/piezas-club-publico";
import { leerPaginaClub } from "@/lib/club-pagina";

// La página PÚBLICA de registro del Club CAYLA (ADR-0288 act. g, G-1 y G-3): la abre la clienta al escanear el QR del cartel
// de una tienda o el de su ticket. El segmento es el `uuid` de la tienda: es la tienda del cartel, la que la saluda por
// WhatsApp al final y la que le escribe después (`clientas.club_ubicacion_id`).
//
// Vive fuera de `app/(app)` a propósito: no hereda su `layout.tsx` (sesión, persona, menú lateral, cabecera del ERP); solo el
// raíz (tipografías, avisos, el loader general y `PaginaEstable`, ninguno pide sesión). `proxy.ts` la deja pasar sin sesión
// (`lib/rutas-publicas.ts`), y también sus dos acciones de servidor, que viajan como POST a esta misma dirección.

// La cursiva de la Garamond, solo para esta página: el «tu regalo.» del título (diseño aprobado el 2026-10-01). El layout raíz
// carga la Garamond derecha; sin esta, el navegador inclinaría la derecha a la fuerza. Se pide aquí y no en el raíz para que el
// ERP no cargue un archivo de letra que no usa. La lee `.club-titulo em` (`app/estilos/club-publico.css`).
const garamondCursiva = EB_Garamond({ subsets: ["latin"], style: ["italic"], variable: "--font-garamond-cursiva", display: "swap" });

export const metadata: Metadata = {
  // Raya larga con espacios, como «Retail — CAYLA»: la pestaña de ella dice qué es, no el nombre del sistema interno.
  title: "Club — CAYLA",
  description: "Únete al Club CAYLA: descuento en tu cumpleaños y un vale de compra por cada año con nosotras.",
  // Una página de registro por tienda: ningún buscador la indexa (se llega por el QR, no buscando).
  robots: { index: false, follow: false },
};

export default async function PaginaRegistroClub({ params }: { params: Promise<{ tienda: string }> }) {
  // Cada visita pregunta a la base: los textos y los beneficios vigentes son los que ella acepta, nunca unos de caché.
  await connection();
  const { tienda } = await params;
  const lectura = await leerPaginaClub(tienda);

  if (lectura.estado === "lista") {
    return (
      <div className={garamondCursiva.variable}>
        <RegistroClub ubicacionId={tienda} paginaInicial={lectura.pagina} />
      </div>
    );
  }
  return (
    <HojaClub>
      {lectura.estado === "no_es_tienda" ? (
        <AvisoClub titulo="Este código no corresponde a una tienda CAYLA">
          <p>Revisa que hayas escaneado el cartel del Club CAYLA de la tienda. Si sigue igual, pídele ayuda en caja.</p>
        </AvisoClub>
      ) : (
        <AvisoClub titulo="No pudimos abrir esta página">
          <p>Inténtalo de nuevo en un rato. Si sigue igual, pídele ayuda a la tienda.</p>
        </AvisoClub>
      )}
    </HojaClub>
  );
}
