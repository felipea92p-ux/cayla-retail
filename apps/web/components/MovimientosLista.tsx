"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilaMovimiento } from "@/components/FilaMovimiento";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import { etiquetaDia, type Movimiento } from "@/lib/movimientos-reglas";

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
// Cómo se dibuja cada fila vive en `FilaMovimiento.tsx`.
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
              {dia.filas.map((m) => (
                <FilaMovimiento key={m.id} m={m} enlaceCompras={enlaceCompras} onAbrir={abrir} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {abierto && <MovimientoDetalle movimiento={abierto} onClose={cerrar} />}
    </>
  );
}
