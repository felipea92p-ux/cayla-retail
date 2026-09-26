"use client";

import Link from "next/link";
import { ArrowLeftRight, ArrowRight, Check, Clock, ReceiptText, Undo2 } from "lucide-react";
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
  onVerVenta,
  veCambios = false,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  esLider: boolean;
  /** Abre el detalle de la venta (prendas, pago, comprobante y reimpresión). */
  onVerVenta?: (linea: LineaVentaReciente) => void;
  /** La cuenta ve el módulo Cambios: la tarjeta ofrece «Cambiar» (R-37, ADR-0161). */
  veCambios?: boolean;
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
        renderCompra={(compra) => <ResumenCompraVenta compra={compra} ahora={ahora} onIniciar={onIniciar} onVerVenta={onVerVenta} veCambios={veCambios} />}
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
 *  (una sola vez, no por prenda) y si ya tuvo un cambio o una devolución.
 *
 *  Acciones (spike 2026-09-26, `docs/maquetas/devoluciones-2026-09`, ADR-0229): ya no un botón negro por
 *  tarjeta —siete iguales no decían nada—, sino «Devolver» con borde y, al lado, «Cambiar» (R-37: el
 *  cambio primero; lleva a Cambios con la prenda elegida). «Ver venta» abre el detalle. Las dos
 *  acciones solo aparecen si queda algo por devolver: la misma regla que ya usa cada prenda
 *  (`estadoPrendaDevolucion`), aplicada a la venta completa. */
function ResumenCompraVenta({
  compra,
  ahora,
  onIniciar,
  onVerVenta,
  veCambios,
}: {
  compra: CompraAgrupada;
  ahora: Date;
  onIniciar: (linea: LineaVentaReciente, preseleccionar: boolean) => void;
  onVerVenta?: (linea: LineaVentaReciente) => void;
  veCambios: boolean;
}) {
  const primera = compra.lineas[0]!;
  const { prendas, importe } = totalesVenta(compra.lineas);
  const actividadPrevia = actividadPreviaVenta(compra.lineas);
  const devolvible = compra.lineas.find((l) => estadoPrendaDevolucion(l, ahora).devolvible);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[15px] tabular-nums text-tinta/85">
          {prendas} {prendas === 1 ? "prenda" : "prendas"} · {soles(importe)}
        </p>
        {!primera.anulada && <ChipEstado estado={estadoPlazoDevolucion(primera.creadoEn, ahora)} />}
        {actividadPrevia && <ChipEstado estado={actividadPrevia} />}
      </div>
      {(onVerVenta || devolvible) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-sand pt-3">
          {onVerVenta && (
            <button type="button" onClick={() => onVerVenta(primera)} className="btn-cayla btn-enlace gap-1.5 text-[13px]">
              <ReceiptText className="h-3.5 w-3.5" aria-hidden />
              Ver venta
            </button>
          )}
          {devolvible && (
            <span className="ml-auto flex items-center gap-4">
              {veCambios && (
                // Con la prenda que todavía se puede tocar: Cambios abre su flujo sobre ella.
                <Link href={`/cambios?item=${devolvible.ventaItemId}`} className="btn-cayla btn-enlace gap-1.5 text-[13px]">
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                  Cambiar
                </Link>
              )}
              <button type="button" onClick={() => onIniciar(primera, false)} className="btn-cayla btn-secundario h-10 border-taupe/50 px-4">
                <Undo2 className="h-4 w-4" aria-hidden />
                Devolver
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
