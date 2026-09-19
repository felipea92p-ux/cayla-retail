"use client";

import { ArrowRight, Check, Clock } from "lucide-react";
import { CLASE_BOTON_FILA, ComprasAgrupadas, FilaPrendaVenta, formatearHora } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { descripcionEntregada, etiquetaDia } from "@/lib/cambios-reglas";
import { estadoPrendaDevolucion } from "@/lib/devoluciones-reglas";

/**
 * Las compras de Devoluciones (2026-09-18): la lista compartida (`ComprasAgrupadas`) con lo
 * propio de una devolución en cada prenda — su historia («Devolución pendiente de
 * aprobación», «Devuelta») y el botón «Iniciar devolución». Fuera de plazo NO esconde el
 * botón (ver `estadoPrendaDevolucion`): lo decide el líder al aprobar.
 *
 * «Anular venta» es de la compra entera, no de una prenda, y solo de un líder: va en el
 * encabezado de cada compra, una sola vez (antes salía en la primera línea de cada venta).
 */
export function DevolucionesVentas({
  lineas,
  ahora,
  esLider,
  onIniciar,
  onAnular,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  esLider: boolean;
  onIniciar: (linea: LineaVentaReciente) => void;
  onAnular: (linea: LineaVentaReciente) => void;
}) {
  return (
    <ComprasAgrupadas
      lineas={lineas}
      ahora={ahora}
      accionCompra={(compra) =>
        esLider && !compra.anulada ? (
          <button
            type="button"
            onClick={() => onAnular(compra)}
            className="rounded-md px-2 py-1 text-xs font-medium text-tinta/70 underline decoration-tinta/25 underline-offset-4 transition-colors duration-200 hover:text-rojo-profundo hover:decoration-rojo-profundo"
          >
            Anular venta
          </button>
        ) : null
      }
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
                <button type="button" onClick={() => onIniciar(linea)} className={CLASE_BOTON_FILA}>
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
