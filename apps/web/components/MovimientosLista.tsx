"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { MovimientoDetalle } from "@/components/MovimientoDetalle";
import {
  ETIQUETA_CATEGORIA,
  etiquetaDia,
  etiquetaProceso,
  nombreCortoSububicacion,
  partesOrigenDestino,
  textoDelta,
  textoReferencia,
  tonoCategoria,
  type Movimiento,
} from "@/lib/movimientos-reglas";

// La lista del historial, agrupada por día. Cada fila es un botón que abre
// el detalle en un modal — la fila ya trae todo (fn_movimientos resolvió las
// referencias), así que abrir el detalle no consulta nada.
//
// El movimiento abierto vive en la URL (`?mov=<id>`) para que «mirá este
// movimiento» sea un enlace que se manda por WhatsApp y abre exactamente eso.
// Se escribe con `history.replaceState`, no con `router.push`: la página es un
// Server Component y un push volvería a consultar Postgres solo por abrir un
// modal. Si el id no está en la página cargada (otros filtros, otra página del
// cursor), no se abre nada — nunca se inventa una consulta extra.
//
// Columnas (diseño de Felipe, 2026-09-16):
// Prenda · Hora y dónde · Proceso · Origen → Destino (y su documento) · Cantidad · Responsable
// La prenda va primero (es lo que se busca con la vista); origen → destino es
// columna propia porque es lo que una encargada lee para entender un
// movimiento sin abrirlo. Responsable solo desde lg: en una pantalla mediana
// las columnas de texto valen más que quién lo hizo, que sigue en el detalle.
const PLANTILLA =
  "sm:grid-cols-[minmax(11rem,1.2fr)_5.5rem_8.5rem_minmax(8rem,1fr)_3.5rem] lg:grid-cols-[minmax(11rem,1.2fr)_5.5rem_8.5rem_minmax(8rem,1fr)_3.5rem_minmax(8rem,0.9fr)]";

export function MovimientosLista({ movimientos, hoyLima }: { movimientos: Movimiento[]; hoyLima: string }) {
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
            { titulo: "Proceso", alinear: "centro" },
            { titulo: "Origen → Destino", alinear: "centro" },
            { titulo: "Cant.", alinear: "centro" },
            { titulo: "Responsable", alinear: "centro", desdeLg: true },
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
              const referencia = textoReferencia(m);
              const detallePrenda = [m.talla, m.color].filter(Boolean).join(" · ");
              const donde = m.sububicacion ? nombreCortoSububicacion(m.sububicacion) : null;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrir(m)}
                  className={fila(PLANTILLA, "w-full text-left transition-colors hover:bg-tinta/[0.03] focus-visible:bg-tinta/[0.03] focus-visible:outline-none")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-tinta" title={m.referencia}>{m.referencia}</span>
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
                  <span className="min-w-0 overflow-visible sm:text-center">
                    <Chip tono={tonoCategoria(m.categoria, m.delta)}>{ETIQUETA_CATEGORIA[m.categoria]}</Chip>
                    <span className="mt-0.5 block truncate text-xs text-tinta/65" title={etiquetaProceso(m.motivo)}>
                      {etiquetaProceso(m.motivo)}
                      {m.esSistema && <span className="label-cayla ml-1.5 text-[10px] text-tinta/50">Sistema</span>}
                    </span>
                  </span>
                  {/* El documento va debajo del destino, como en el diseño («Piso →
                      Clienta · Boleta B001-123»): es la prueba de ESE tránsito. */}
                  <span className="min-w-0 sm:text-center">
                    <span className="block truncate text-sm text-tinta/75" title={origenDestino}>
                      <span className="label-cayla mr-1 text-[10px] text-tinta/45 sm:hidden">De · a</span>
                      {destino ? (
                        <>
                          {origen} <span className="text-tinta/45">→</span> {destino}
                        </>
                      ) : (
                        origen
                      )}
                    </span>
                    {referencia && (
                      <span className="block truncate text-xs text-tinta/55" title={referencia}>
                        {referencia}
                      </span>
                    )}
                  </span>
                  <span
                    className={celda(
                      "centro",
                      `text-sm font-semibold tabular-nums ${m.delta > 0 ? "text-verde-profundo" : m.delta < 0 ? "text-tinta" : "text-tinta/65"}`
                    )}
                  >
                    {textoDelta(m)}
                  </span>
                  <span className={celda("centro", "hidden text-xs text-tinta/75 lg:block")} title={m.usuario ?? undefined}>
                    {m.esSistema ? "Sistema" : (m.usuario ?? "—")}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </Tabla>

      {abierto && <MovimientoDetalle movimiento={abierto} onClose={cerrar} />}
    </>
  );
}
