"use client";

import Link from "next/link";
import type { TonoChip } from "@/components/ui/Chip";
import {
  etiquetaMovimiento,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  textoDelta,
  tonoCategoria,
  type Movimiento,
  type ReferenciaMovimiento,
} from "@/lib/movimientos-reglas";

// Una fila de la lista de Movimientos: una prenda, cuánto, de dónde a dónde, el proceso que lo originó y su
// referencia. Vive aparte de `MovimientosLista` para que la lista pueda agruparlas (varias filas guardadas de una
// sola vez son UNA operación) sin repetir cómo se dibuja cada una.
//
// Forma (rediseño 2026-09-22, elegida por Felipe en la demo de
// docs/maquetas/movimientos-rediseno-2026-09/): la lista de la guía oficial, no una tabla.
// Cada fila: punto de color · prenda (y debajo, talla · color · hora · dónde) · proceso (y
// debajo, de dónde a dónde) · referencia · cantidad. La tabla de seis columnas no cabía en
// ~650 px; la lista se lee de corrido en escritorio y en celular pasa a dos líneas —prenda y
// cantidad arriba, proceso y referencia abajo— sin desplazarse de lado. Ya no hay
// «Responsable»: la autoría sigue guardada y se ve en el detalle.
//
// La fila NO es un <button>: la referencia es un enlace y un enlace dentro de un botón
// no es HTML válido. El botón que abre el detalle cubre la fila entera (`absolute
// inset-0`) y el enlace queda encima (`relative z-10`).
export const FILA_MOVIMIENTO =
  "relative grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 transition-colors hover:bg-crema/60 focus-within:bg-crema/60 sm:grid-cols-[0.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem] sm:items-center sm:gap-x-4 sm:px-2";

// El tono que antes llevaba el chip de categoría, ahora como un punto: sobrio, y no
// obliga a que «Transferencia · llegada» quepa en un chip de versalitas.
export const PUNTO_MOVIMIENTO: Record<TonoChip, string> = {
  neutro: "bg-tinta/30",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
  pizarra: "bg-pizarra",
  apagado: "bg-tinta/15",
};

export function FilaMovimiento({ m, enlaceCompras, onAbrir }: { m: Movimiento; enlaceCompras: boolean; onAbrir: (m: Movimiento) => void }) {
  const { origen, destino } = partesOrigenDestino(m);
  const etiqueta = etiquetaMovimiento(m);
  const referencia = referenciaMovimiento(m, { enlaceCompras });
  const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
  const variante = [m.talla, m.color].filter(Boolean).join(" · ");
  const interno = m.categoria === "interno" || m.categoria === "apartado" || m.categoria === "liberacion_apartado";
  return (
    <li className={FILA_MOVIMIENTO}>
      <button
        type="button"
        onClick={() => onAbrir(m)}
        aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}, ${textoDelta(m)}`}
        className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
      />

      <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO_MOVIMIENTO[tonoCategoria(m.categoria, m.delta)]}`} />

      {/* Prenda: el nombre arriba; talla · color · hora · dónde debajo. El SKU queda en el
          título (y la búsqueda lo encuentra): la guía lo saca de la vista. */}
      <span className="min-w-0" title={m.sku}>
        <span className="block truncate text-[13.5px] font-semibold text-tinta">{m.referencia}</span>
        <span className="block truncate text-xs tabular-nums text-taupe">{[variante, m.hora, donde].filter(Boolean).join(" · ")}</span>
      </span>

      {/* Proceso y referencia. En celular bajan a una segunda línea bajo la prenda
          (col-start-2 col-span-2); desde sm cada uno tiene su columna. */}
      <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
        <span className="min-w-0 sm:col-start-3 sm:row-start-1">
          {/* El proceso y la dirección son lo que se viene a leer: si no caben se parten, no se
              cortan con «…» («Transferencia · lleg…» no dice si llegó o salió). */}
          <span className="block break-words text-[13px] leading-snug text-tinta">{etiqueta}</span>
          <span className="hidden break-words text-xs leading-snug text-taupe sm:block">{destino ? `${origen} → ${destino}` : origen}</span>
        </span>
        <span className="min-w-0 sm:col-start-4 sm:row-start-1">{referencia && <Referencia r={referencia} />}</span>
      </span>

      <span
        className={`col-start-3 row-start-1 text-right text-[13.5px] font-bold tabular-nums sm:col-start-5 ${
          m.delta > 0 ? "text-verde" : interno ? "font-medium text-taupe" : "text-tinta"
        }`}
      >
        {interno && <span aria-hidden>⇄ </span>}
        {textoDelta(m)}
      </span>
    </li>
  );
}

/** La referencia: texto, o enlace (tinta subrayado, como los demás enlaces de acción del
 *  sistema — ADR-0105) cuando lleva a algo. `relative z-10` para quedar por encima del botón
 *  que cubre la fila. */
export function Referencia({ r }: { r: ReferenciaMovimiento }) {
  return (
    <span className="block min-w-0">
      {r.href ? (
        <Link
          href={r.href}
          title={`Abrir ${r.texto}`}
          className="relative z-10 inline-block max-w-full truncate align-bottom text-[13px] text-tinta underline decoration-tinta/30 underline-offset-2 transition-colors hover:text-rojo hover:decoration-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
        >
          {r.texto}
        </Link>
      ) : (
        <span className="block truncate text-[13px] text-taupe" title={r.texto}>
          {r.texto}
        </span>
      )}
      {r.detalle && (
        <span className="block truncate text-xs text-taupe" title={r.detalle}>
          {r.detalle}
        </span>
      )}
    </span>
  );
}
