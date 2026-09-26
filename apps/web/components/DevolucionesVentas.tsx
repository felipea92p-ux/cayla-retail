"use client";

import { ArrowRight, Check, Clock } from "lucide-react";
import { CLASE_BOTON_FILA, ChipEstado, ComprasAgrupadas, FilaPrendaVenta, formatearHora, type CompraAgrupada } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { actividadPreviaVenta, descripcionEntregada, etiquetaDia, totalesVenta } from "@/lib/cambios-reglas";
import { estadoPlazoDevolucion, estadoPrendaDevolucion } from "@/lib/devoluciones-reglas";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";

/**
 * Las compras de Devoluciones (2026-09-18), en dos modos (2026-09-22, ver
 * `docs/pantallas/devoluciones.md` tarea #8):
 * - `resumen` (Actividad reciente): UNA tarjeta por venta —cuánto sumó, el plazo, si ya
 *   tuvo actividad— con un solo botón. Qué prenda se devuelve se elige recién en el paso
 *   "Prendas" del flujo (`ResumenCompraVenta`).
 * - detalle (por defecto — resultados de "Iniciar una devolución"): una fila por prenda
 *   con su propia historia y su propio botón, porque ahí la colaboradora ya encontró UNA
 *   prenda puntual (por SKU escaneado o nombre) y ese es el punto de partida natural.
 *
 * «Anular venta» es de la compra entera, no de una prenda, y solo de un líder: va en el
 * encabezado de cada compra en los dos modos (lo pinta `ComprasAgrupadas`). Solo se ofrece
 * el mismo día de Lima en que se vendió (PL-29, lo exige `anular_venta`): después, Cambio o
 * Devolución.
 */
export function DevolucionesVentas({
  lineas,
  ahora,
  esLider,
  resumen = false,
  onIniciar,
  onAnular,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  esLider: boolean;
  /** `true` en Actividad reciente: una tarjeta por venta en vez de una fila por prenda. */
  resumen?: boolean;
  /** `preseleccionar` marca esa prenda al entrar al flujo (clic en una fila puntual); en
   *  el resumen por venta nada se marca todavía — se elige en el paso "Prendas". */
  onIniciar: (linea: LineaVentaReciente, preseleccionar: boolean) => void;
  onAnular: (linea: LineaVentaReciente) => void;
}) {
  const accionCompra = (compra: LineaVentaReciente) =>
    esLider && !compra.anulada && hoyLima(new Date(compra.creadoEn)) === hoyLima(ahora) ? (
      <button
        type="button"
        onClick={() => onAnular(compra)}
        className="rounded-md px-2 py-1 text-xs font-medium text-tinta/70 underline decoration-tinta/25 underline-offset-4 transition-colors duration-200 hover:text-rojo-profundo hover:decoration-rojo-profundo"
      >
        Anular venta
      </button>
    ) : null;

  if (resumen) {
    return (
      <ComprasAgrupadas
        lineas={lineas}
        ahora={ahora}
        accionCompra={accionCompra}
        renderCompra={(compra) => <ResumenCompraVenta compra={compra} ahora={ahora} onIniciar={onIniciar} />}
      />
    );
  }

  return (
    <ComprasAgrupadas
      lineas={lineas}
      ahora={ahora}
      accionCompra={accionCompra}
      renderFila={(linea) => {
        const estado = estadoPrendaDevolucion(linea, ahora);
        return (
          <FilaPrendaVenta
            key={linea.ventaItemId}
            linea={linea}
            estado={estado}
            detalle={
              <>
                {linea.devolucionesHechas.map((d, i) =>
                  d.estado === "pendiente" ? (
                    <p key={`d${i}`} className="mt-1 flex items-center gap-1.5 text-xs text-ambar-profundo">
                      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {d.cantidad > 1 ? `${d.cantidad} unidades: ` : ""}devolución pendiente de aprobación · {etiquetaDia(d.creadoEn, ahora).toLowerCase()} {formatearHora(d.creadoEn)}
                    </p>
                  ) : (
                    <p key={`d${i}`} className="mt-1 flex items-center gap-1.5 text-xs text-verde-profundo">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {linea.cantidad > 1 ? `${d.cantidad} devuelta${d.cantidad === 1 ? "" : "s"}` : "Devuelta"} · {etiquetaDia(d.creadoEn, ahora).toLowerCase()} {formatearHora(d.creadoEn)}
                    </p>
                  )
                )}
                {linea.cambiosHechos.map((c, i) => (
                  <p key={`c${i}`} className="mt-1 flex items-center gap-1.5 text-xs text-verde-profundo">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {linea.cantidad > 1 ? `${c.cantidad} cambiada${c.cantidad === 1 ? "" : "s"}` : "Cambiada"} por {descripcionEntregada(c, linea.productoId)}
                  </p>
                ))}
              </>
            }
            accion={
              estado.devolvible && (
                <button type="button" onClick={() => onIniciar(linea, true)} className={CLASE_BOTON_FILA}>
                  Iniciar devolución
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              )
            }
          />
        );
      }}
    />
  );
}

/** El resumen de UNA venta para Actividad reciente: cuánto sumó, el plazo de la boleta
 *  (una sola vez, no por prenda) y si ya tuvo un cambio o una devolución. El botón solo
 *  aparece si queda algo por devolver — la misma regla que ya usa cada prenda
 *  (`estadoPrendaDevolucion`), aplicada a la venta completa. */
function ResumenCompraVenta({
  compra,
  ahora,
  onIniciar,
}: {
  compra: CompraAgrupada;
  ahora: Date;
  onIniciar: (linea: LineaVentaReciente, preseleccionar: boolean) => void;
}) {
  const primera = compra.lineas[0]!;
  const { prendas, importe } = totalesVenta(compra.lineas);
  const actividadPrevia = actividadPreviaVenta(compra.lineas);
  const algoDevolvible = compra.lineas.some((l) => estadoPrendaDevolucion(l, ahora).devolvible);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-tinta/85">
          {prendas} {prendas === 1 ? "prenda" : "prendas"} · {soles(importe)}
        </p>
        {!primera.anulada && <ChipEstado estado={estadoPlazoDevolucion(primera.creadoEn, ahora)} />}
        {actividadPrevia && <ChipEstado estado={actividadPrevia} />}
      </div>
      {algoDevolvible && (
        <button type="button" onClick={() => onIniciar(primera, false)} className={CLASE_BOTON_FILA}>
          Iniciar devolución
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
