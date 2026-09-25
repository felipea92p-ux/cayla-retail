"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { TonoChip } from "@/components/ui/Chip";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import {
  etiquetaDia,
  etiquetaMovimiento,
  nombreCortoSububicacion,
  partesOrigenDestino,
  referenciaMovimiento,
  textoDelta,
  tonoCategoria,
  type Movimiento,
  type ReferenciaMovimiento,
} from "@/lib/movimientos-reglas";

// La lista del historial, agrupada por día. Muestra el EFECTO sobre el stock de la
// sede que se mira (qué prenda, cuánto, de dónde a dónde) y el proceso que lo originó
// («Movimiento» dice qué fue; «Referencia» dice cuál: Traslado 24, Boleta B001-000184).
// Qué prendas viajaron juntas, el envío, la recepción y las diferencias los cuenta
// Traslados: acá solo hay un enlace para llegar a él, no una copia.
//
// Cada fila abre el detalle en un modal — la fila ya trae todo (fn_movimientos
// resolvió las referencias), así que abrir el detalle no consulta nada.
//
// El movimiento abierto vive en la URL (`?mov=<id>`) para que «mirá este
// movimiento» sea un enlace que se manda por WhatsApp y abre exactamente eso.
// Se escribe con `history.replaceState`, no con `router.push`: la página es un
// Server Component y un push volvería a consultar Postgres solo por abrir un
// modal. Si el id no está en la página cargada (otros filtros, otra página del
// cursor), no se abre nada — nunca se inventa una consulta extra.
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
const FILA =
  "relative grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 transition-colors hover:bg-crema/60 focus-within:bg-crema/60 sm:grid-cols-[0.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem] sm:items-center sm:gap-x-4 sm:px-2";

// El tono que antes llevaba el chip de categoría, ahora como un punto: sobrio, y no
// obliga a que «Transferencia · llegada» quepa en un chip de versalitas.
const PUNTO: Record<TonoChip, string> = {
  neutro: "bg-tinta/30",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
  pizarra: "bg-pizarra",
  apagado: "bg-tinta/15",
};

export function MovimientosLista({ movimientos, hoyLima, enlaceCompras }: { movimientos: Movimiento[]; hoyLima: string; enlaceCompras: boolean }) {
  const params = useSearchParams();
  const [abiertoId, setAbiertoId] = useState<string | null>(() => params.get("mov"));
  const abierto = abiertoId ? (movimientos.find((m) => m.id === abiertoId) ?? null) : null;

  function sincronizarUrl(id: string | null) {
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("mov", id);
    else p.delete("mov");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }
  function abrir(m: Movimiento) {
    setAbiertoId(m.id);
    sincronizarUrl(m.id);
  }
  function cerrar() {
    setAbiertoId(null);
    sincronizarUrl(null);
  }

  // Agrupar por día de Lima (`fecha` ya viene calculada en SQL): la lista
  // llega ordenada por fecha desc, así que los grupos salen en orden solos.
  const dias: { fecha: string; filas: Movimiento[] }[] = [];
  for (const m of movimientos) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === m.fecha) ultimo.filas.push(m);
    else dias.push({ fecha: m.fecha, filas: [m] });
  }

  return (
    <>
      {/* `?mov=<id>` compartido (por WhatsApp, por ejemplo) que ya no está en
          esta página — normalmente porque cae fuera del rango de fechas
          actual. No se dispara una consulta extra para ir a buscarlo (ver
          comentario de arriba); esto es solo avisar que no apareció, en vez
          de no decir nada. */}
      {abiertoId && !abierto && (
        <div className="nota-cayla mb-4 flex items-center justify-between gap-3 text-sm">
          <span>Ese movimiento no está en el rango o los filtros actuales — prueba ampliándolos.</span>
          <button type="button" onClick={cerrar} className="label-cayla shrink-0 text-[11px] text-taupe underline underline-offset-2 hover:text-rojo">
            Entendido
          </button>
        </div>
      )}

      <div className="card-cayla px-4 pb-2 sm:px-5">
        {dias.map((dia) => (
          <section key={dia.fecha} aria-label={etiquetaDia(dia.fecha, hoyLima)}>
            <h3 className="flex items-baseline justify-between gap-3 border-b border-sand pb-2 pt-4">
              <span className="label-cayla text-[11px] font-bold text-tinta">{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className="label-cayla text-[10.5px] font-bold text-taupe">
                {dia.filas.length} {dia.filas.length === 1 ? "movimiento" : "movimientos"}
              </span>
            </h3>
            <ul className="divide-y divide-sand">
              {dia.filas.map((m) => {
                const { origen, destino } = partesOrigenDestino(m);
                const etiqueta = etiquetaMovimiento(m);
                const referencia = referenciaMovimiento(m, { enlaceCompras });
                const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
                const variante = [m.talla, m.color].filter(Boolean).join(" · ");
                const interno = m.categoria === "interno" || m.categoria === "apartado" || m.categoria === "liberacion_apartado";
                return (
                  <li key={m.id} className={FILA}>
                    <button
                      type="button"
                      onClick={() => abrir(m)}
                      aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}, ${textoDelta(m)}`}
                      className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
                    />

                    <span aria-hidden className={`mt-1.5 h-[7px] w-[7px] rounded-full sm:mt-0 ${PUNTO[tonoCategoria(m.categoria, m.delta)]}`} />

                    {/* Prenda: el nombre arriba; talla · color · hora · dónde debajo. El SKU queda en el
                        título (y la búsqueda lo encuentra): la guía lo saca de la vista. */}
                    <span className="min-w-0" title={m.sku}>
                      <span className="block truncate text-[13.5px] font-semibold text-tinta">{m.referencia}</span>
                      <span className="block truncate text-xs tabular-nums text-taupe">
                        {[variante, m.hora, donde].filter(Boolean).join(" · ")}
                      </span>
                    </span>

                    {/* Proceso y referencia. En celular bajan a una segunda línea bajo la prenda
                        (col-start-2 col-span-2); desde sm cada uno tiene su columna. */}
                    <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 sm:contents">
                      <span className="min-w-0 sm:col-start-3 sm:row-start-1">
                        {/* El proceso y la dirección son lo que se viene a leer: si no caben se parten, no se
                            cortan con «…» («Transferencia · lleg…» no dice si llegó o salió). */}
                        <span className="block break-words text-[13px] leading-snug text-tinta">{etiqueta}</span>
                        <span className="hidden break-words text-xs leading-snug text-taupe sm:block">
                          {destino ? `${origen} → ${destino}` : origen}
                        </span>
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
              })}
            </ul>
          </section>
        ))}
      </div>

      {abierto && <MovimientoDetalle movimiento={abierto} onClose={cerrar} />}
    </>
  );
}

/** La referencia: texto, o enlace (tinta subrayado, como los demás enlaces de acción del
 *  sistema — ADR-0105) cuando lleva a algo. `relative z-10` para quedar por encima del botón
 *  que cubre la fila. */
function Referencia({ r }: { r: ReferenciaMovimiento }) {
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
