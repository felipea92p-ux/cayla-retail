"use client";

import { ArrowRight, Check } from "lucide-react";
import { CLASE_BOTON_FILA, ComprasAgrupadas, FilaPrendaVenta, formatearHora } from "@/components/ComprasAgrupadas";
import type { LineaVentaReciente } from "@/lib/ventas-v2";
import { descripcionEntregada, estadoPrendaVendida, etiquetaDia } from "@/lib/cambios-reglas";

/**
 * Las compras de Cambios (2026-09-18): la lista compartida (`ComprasAgrupadas`) con lo
 * propio de un cambio en los huecos de cada prenda — «Cambiada por Negro · Talla L» y el
 * botón «Iniciar cambio».
 */
export function CambiosVentas({
  lineas,
  ahora,
  onIniciar,
}: {
  lineas: LineaVentaReciente[];
  ahora: Date;
  onIniciar: (linea: LineaVentaReciente) => void;
}) {
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
                <button type="button" onClick={() => onIniciar(linea)} className={CLASE_BOTON_FILA}>
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
