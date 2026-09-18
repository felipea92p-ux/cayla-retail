import Link from "next/link";

/* ====================================================================
   SegmentoEnlaces · un control de dos o tres opciones que vive en la URL
   (2026-09-18, ADR-0106)

   «Emisión | Vencimiento» en Comprobantes y «Por urgencia | Por proveedor»
   en Por pagar. Son enlaces, no botones con estado: la opción elegida es un
   parámetro de la URL (como los filtros), así el Server Component sabe qué
   dibujar, se puede compartir y «atrás» funciona. Quien lo usa arma cada
   `href` conservando el resto de los parámetros.

   Mismo aspecto que la pastilla segmentada de las maquetas: borde fino, la
   activa en tinta con letras crema. Alto 36 px (h-9) para alinearse con el
   buscador y el botón «Filtros» de `FiltrosCompras`.
   ==================================================================== */

export type OpcionSegmento = { valor: string; etiqueta: string; href: string };

export function SegmentoEnlaces({ opciones, activo, etiquetaAccesible }: { opciones: OpcionSegmento[]; activo: string; etiquetaAccesible: string }) {
  return (
    <nav aria-label={etiquetaAccesible} className="inline-flex h-9 overflow-hidden rounded-lg border border-tinta/15">
      {opciones.map((o) => {
        const esActivo = o.valor === activo;
        return (
          <Link
            key={o.valor}
            href={o.href}
            replace
            aria-current={esActivo ? "true" : undefined}
            className={`label-cayla flex items-center whitespace-nowrap px-3.5 text-[11px] transition-colors ${
              esActivo ? "bg-tinta text-crema" : "text-tinta/65 hover:text-rojo"
            }`}
          >
            {o.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
