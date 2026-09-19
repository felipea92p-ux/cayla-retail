"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
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
// Columnas (2026-09-19): Prenda · Hora y dónde · Movimiento · Origen → Destino · Cant. ·
// Referencia. Ya no hay «Responsable»: la autoría sigue guardada y se ve en el detalle.
// Desde xl la referencia tiene su columna; con menos ancho baja a la segunda línea de
// «Movimiento» (una tabla de seis columnas no cabe en ~650 px y una columna que se
// esconde sin avisar es peor que una que se apila).
//
// La fila NO es un <button>: la referencia es un enlace y un enlace dentro de un botón
// no es HTML válido. El botón que abre el detalle cubre la fila entera (`absolute
// inset-0`) y el enlace queda encima (`relative z-10`).
//
// Anchos: la prenda cede espacio (su nombre y su código son lo único que aguanta un «…»); el
// movimiento y el origen → destino lo reciben, porque «Transferencia · llegada» y «Taller →
// Tienda Trujillo» son lo que se viene a leer. En pantallas muy angostas se parten en dos
// líneas antes que cortarse.
const PLANTILLA =
  "sm:grid-cols-[minmax(5rem,0.7fr)_4rem_minmax(7rem,1.3fr)_minmax(6rem,1.15fr)_2.75rem] xl:grid-cols-[minmax(10rem,1.2fr)_5rem_minmax(9.5rem,0.9fr)_minmax(8rem,1fr)_3.5rem_minmax(7.5rem,0.9fr)]";

// El tono que antes llevaba el chip de categoría, ahora como un punto: sobrio, y no
// obliga a que «Transferencia · llegada» quepa en un chip de versalitas.
const PUNTO: Record<TonoChip, string> = {
  neutro: "bg-tinta/30",
  ambar: "bg-ambar",
  verde: "bg-verde",
  rojo: "bg-rojo",
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
        <div className="card-cayla mb-4 flex items-center justify-between gap-3 px-4 py-3 text-sm text-tinta/75">
          <span>Ese movimiento no está en el rango o los filtros actuales — prueba ampliándolos.</span>
          <button type="button" onClick={cerrar} className="label-cayla shrink-0 text-[11px] text-tinta/55 underline underline-offset-2 hover:text-rojo">
            Entendido
          </button>
        </div>
      )}

      <Tabla>
        <Encabezado
          plantilla={PLANTILLA}
          columnas={[
            { titulo: "Prenda · variante" },
            { titulo: "Hora · dónde", alinear: "centro" },
            { titulo: "Movimiento", alinear: "centro" },
            { titulo: "Origen → Destino", alinear: "centro" },
            { titulo: "Cant.", alinear: "centro" },
            { titulo: "Referencia", alinear: "centro", desdeXl: true },
          ]}
        />
        {dias.map((dia) => (
          <div key={dia.fecha} className="divide-y divide-tinta/10">
            <div className="flex items-baseline justify-between bg-tinta/[0.03] px-5 py-1.5">
              <span className="label-cayla text-[11px] text-tinta">{etiquetaDia(dia.fecha, hoyLima)}</span>
              <span className="text-xs text-tinta/55">
                {dia.filas.length} {dia.filas.length === 1 ? "movimiento" : "movimientos"}
              </span>
            </div>
            {dia.filas.map((m) => {
              const { origen, destino } = partesOrigenDestino(m);
              const origenDestino = destino ? `${origen} → ${destino}` : origen;
              const etiqueta = etiquetaMovimiento(m);
              const referencia = referenciaMovimiento(m, { enlaceCompras });
              const detallePrenda = [m.talla, m.color].filter(Boolean).join(" · ");
              const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
              return (
                <div key={m.id} className={fila(PLANTILLA, "relative w-full text-left transition-colors hover:bg-tinta/[0.03] focus-within:bg-tinta/[0.03]")}>
                  <button
                    type="button"
                    onClick={() => abrir(m)}
                    aria-label={`Ver el detalle: ${etiqueta}, ${m.referencia}, ${textoDelta(m)}`}
                    className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rojo"
                  />

                  <span className="min-w-0">
                    <span className="line-clamp-2 block break-words text-sm leading-snug text-tinta" title={m.referencia}>{m.referencia}</span>
                    <span className="block truncate text-xs text-tinta/65" title={`${m.sku}${detallePrenda ? ` · ${detallePrenda}` : ""}`}>
                      <span className="font-mono">{m.sku}</span>
                      {detallePrenda && ` · ${detallePrenda}`}
                    </span>
                  </span>

                  {/* `sm:text-center`, no `text-center` a secas: en celular la fila se apila
                      y ahí sigue yendo todo a la izquierda (mismo criterio que `celda()`). */}
                  <span className="min-w-0 sm:text-center">
                    <span className="block text-sm tabular-nums text-tinta">{m.hora}</span>
                    {donde && <span className="block truncate text-xs text-tinta/55">{donde}</span>}
                  </span>

                  {/* El proceso y la dirección son lo que se viene a leer: si no caben en una línea se
                      parten en dos, no se cortan con «…» («Transferencia · lleg…» no dice si llegó o salió). */}
                  <span className="min-w-0 sm:text-center">
                    <span className="inline-flex max-w-full items-start gap-1.5 text-left text-sm leading-snug text-tinta" title={etiqueta}>
                      <span aria-hidden className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tonoCategoria(m.categoria, m.delta)]}`} />
                      <span className="min-w-0 break-words">{etiqueta}</span>
                    </span>
                    {/* Con menos de xl la referencia no tiene columna: va debajo del movimiento. */}
                    {referencia && (
                      <span className="mt-0.5 block xl:hidden">
                        <Referencia r={referencia} />
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 sm:text-center">
                    <span className="block break-words text-sm leading-snug text-tinta/75" title={origenDestino}>
                      <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">De · a</span>
                      {destino ? (
                        <>
                          {origen} <span className="text-tinta/45">→</span> {destino}
                        </>
                      ) : (
                        origen
                      )}
                    </span>
                  </span>

                  <span
                    className={celda(
                      "centro",
                      `text-sm font-semibold tabular-nums ${m.delta > 0 ? "text-verde-profundo" : m.delta < 0 ? "text-tinta" : "text-tinta/65"}`
                    )}
                  >
                    {textoDelta(m)}
                  </span>

                  {/* Siempre está la celda (vacía si no hay proceso): sin ella, desde xl las
                      columnas de la fila no coincidirían con las del encabezado. */}
                  <span className="hidden min-w-0 xl:block xl:text-center">{referencia && <Referencia r={referencia} />}</span>
                </div>
              );
            })}
          </div>
        ))}
      </Tabla>

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
          className="relative z-10 inline-block max-w-full truncate align-bottom text-sm text-tinta underline decoration-tinta/30 underline-offset-2 transition-colors hover:text-rojo hover:decoration-rojo focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo"
        >
          {r.texto}
        </Link>
      ) : (
        <span className="block truncate text-sm text-tinta/80" title={r.texto}>
          {r.texto}
        </span>
      )}
      {r.detalle && (
        <span className="block truncate text-xs text-tinta/55" title={r.detalle}>
          {r.detalle}
        </span>
      )}
    </span>
  );
}
