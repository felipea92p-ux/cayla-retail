"use client";

import { ArrowRight, Check } from "lucide-react";
import { CLASE_BOTON_FILA, ChipEstado, ComprasAgrupadas, FilaPrendaVenta, formatearHora, type CompraAgrupada } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { actividadPreviaVenta, descripcionEntregada, estadoPlazoVenta, estadoPrendaVendida, etiquetaDia, totalesVenta } from "@/lib/cambios-reglas";
import { soles } from "@/lib/compras-reglas";

/**
 * Las compras de Cambios, en dos modos (2026-09-22, mismo patrón que Devoluciones — ver
 * `docs/pantallas/devoluciones.md` tarea #8):
 * - `resumen` (Actividad reciente): UNA tarjeta por venta —cuánto sumó, el plazo, si ya
 *   tuvo actividad— con un solo botón. Qué prenda se cambia se elige recién en el paso
 *   "Prenda" del flujo (`ResumenCompraVentaCambio`).
 * - detalle (por defecto — resultados de "Iniciar un cambio"): una fila por prenda con
 *   su propia historia y su propio botón, porque ahí la colaboradora ya encontró UNA
 *   prenda puntual (por SKU escaneado o nombre).
 */
export function CambiosVentas({
  lineas,
  ahora,
  resumen = false,
  onIniciar,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  /** `true` en Actividad reciente: una tarjeta por venta en vez de una fila por prenda. */
  resumen?: boolean;
  /** `preseleccionar` marca esa prenda al entrar al flujo (clic en una fila puntual); en
   *  el resumen por venta nada se marca todavía — se elige en el paso "Prenda". */
  onIniciar: (linea: LineaVentaReciente, preseleccionar: boolean) => void;
}) {
  if (resumen) {
    return (
      <ComprasAgrupadas
        lineas={lineas}
        ahora={ahora}
        renderCompra={(compra) => <ResumenCompraVentaCambio compra={compra} ahora={ahora} onIniciar={onIniciar} />}
      />
    );
  }

  return (
    <ComprasAgrupadas
      lineas={lineas}
      ahora={ahora}
      renderFila={(linea) => {
        const estado = estadoPrendaVendida(linea, ahora);
        return (
          <FilaPrendaVenta
            key={linea.ventaItemId}
            linea={linea}
            estado={estado}
            detalle={linea.cambiosHechos.map((c, i) => (
              <p key={i} className="mt-1 flex items-center gap-1.5 text-xs text-verde-profundo">
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {linea.cantidad > 1 ? `${c.cantidad} cambiada${c.cantidad === 1 ? "" : "s"}` : "Cambiada"} por {descripcionEntregada(c, linea.productoId)} ·{" "}
                {etiquetaDia(c.creadoEn, ahora).toLowerCase()} {formatearHora(c.creadoEn)}
              </p>
            ))}
            accion={
              estado.cambiable && (
                <button type="button" onClick={() => onIniciar(linea, true)} className={CLASE_BOTON_FILA}>
                  Iniciar cambio
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

/** El resumen de UNA venta para Actividad reciente: cuánto sumó, el plazo (una sola vez,
 *  no por prenda) y si ya tuvo un cambio o una devolución. El botón solo aparece si queda
 *  algo por cambiar — la misma regla que ya usa cada prenda (`estadoPrendaVendida`),
 *  aplicada a la venta completa. */
function ResumenCompraVentaCambio({
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
  const algoCambiable = compra.lineas.some((l) => estadoPrendaVendida(l, ahora).cambiable);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-tinta/85">
          {prendas} {prendas === 1 ? "prenda" : "prendas"} · {soles(importe)}
        </p>
        {!primera.anulada && <ChipEstado estado={estadoPlazoVenta(primera.creadoEn, ahora)} />}
        {actividadPrevia && <ChipEstado estado={actividadPrevia} />}
      </div>
      {algoCambiable && (
        <button type="button" onClick={() => onIniciar(primera, false)} className={CLASE_BOTON_FILA}>
          Iniciar cambio
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
