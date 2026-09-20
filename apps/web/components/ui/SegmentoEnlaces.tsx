import Link from "next/link";
import { IndicadorDeslizante } from "@/components/ui/IndicadorDeslizante";

/* ====================================================================
   SegmentoEnlaces · un control de dos o tres opciones que vive en la URL
   (2026-09-18, ADR-0111)

   «Emisión | Vencimiento» en Comprobantes y «Por urgencia | Por proveedor»
   en Por pagar. Son enlaces, no botones con estado: la opción elegida es un
   parámetro de la URL (como los filtros), así el Server Component sabe qué
   dibujar, se puede compartir y «atrás» funciona. Quien lo usa arma cada
   `href` conservando el resto de los parámetros.

   Mismo aspecto que la pastilla segmentada de las maquetas: borde fino, la
   activa en tinta con letras crema. Alto 36 px (h-9) para alinearse con el
   buscador y el botón «Filtros» de `FiltrosCompras`.

   `deslizante` (2026-09-19, ADR-0136, opt-in): el fondo oscuro de la opción elegida deja de saltar de
   una a otra y pasa a ser una pastilla (`IndicadorDeslizante`) que se desliza hasta ella aunque la
   página se vuelva a pedir al servidor. Sin la prop se dibuja exactamente igual que antes.
   ==================================================================== */

export type OpcionSegmento = { valor: string; etiqueta: string; href: string };

export function SegmentoEnlaces({
  opciones,
  activo,
  etiquetaAccesible,
  deslizante = false,
  idIndicador = "segmento",
}: {
  opciones: OpcionSegmento[];
  activo: string;
  etiquetaAccesible: string;
  deslizante?: boolean;
  idIndicador?: string;
}) {
  return (
    <nav aria-label={etiquetaAccesible} className={`inline-flex h-9 overflow-hidden rounded-lg border border-tinta/15 ${deslizante ? "relative" : ""}`}>
      {opciones.map((o) => {
        const esActivo = o.valor === activo;
        // Deslizante: el texto va sobre la pastilla (`relative z-10`); la marca estática `cmp-seg-activa`
        // pinta el fondo hasta que el indicador se coloca.
        const estado = esActivo ? (deslizante ? "cmp-seg-activa text-crema" : "bg-tinta text-crema") : "text-tinta/65 hover:text-rojo";
        return (
          <Link
            key={o.valor}
            href={o.href}
            replace
            aria-current={esActivo ? "true" : undefined}
            className={`label-cayla flex items-center whitespace-nowrap px-3.5 text-[11px] transition-colors ${deslizante ? "relative z-10" : ""} ${estado}`}
          >
            {o.etiqueta}
          </Link>
        );
      })}
      {deslizante && <IndicadorDeslizante activa={activo} id={idIndicador} variante="pastilla" />}
    </nav>
  );
}
