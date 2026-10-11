"use client";

import { nombresCortos } from "@/lib/nombre-integrante";
import type { VentaDeHoy } from "@/lib/useVentasDeHoy";
import { ShoppingBag } from "lucide-react";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";

/** La lista de ventas de hoy (solo pinta: los datos salen de `useVentasDeHoy`, `lib/useVentasDeHoy.ts`). */
export function VentasDeHoyLista({ ventas, fallo, ubicacionEtiqueta }: { ventas: readonly VentaDeHoy[]; fallo: string | null; ubicacionEtiqueta: string }) {
  if (fallo && ventas.length === 0) {
    return <Aviso tono="error">{fallo}</Aviso>;
  }

  if (ventas.length === 0) {
    return (
      <div className="card-cayla">
        <Vacio tamano="chico" icono={<ShoppingBag />}>
          Aún no hay ventas hoy en {ubicacionEtiqueta}.
        </Vacio>
      </div>
    );
  }

  // Cada venta lleva la firma de la integrante que la hizo (primer nombre; inicial del
  // apellido solo si dos integrantes del día se llaman igual). `vendedor` vacío o el
  // relleno «—» de la RPC no es una integrante: no se pinta nada, no se inventa.
  const integrante = nombresCortos(ventas.map((v) => v.vendedor));

  return (
    <div className="card-cayla divide-y divide-sand !p-0">
      {fallo && (
        <div className="p-2">
          <Aviso tono="error" chico>
            {fallo}
          </Aviso>
        </div>
      )}
      {/* `anim-revelar` sin `key` extra: React reutiliza el nodo de cada venta que repite
          `key={v.venta_id}` al releer (no vuelve a animarse), y monta uno nuevo —y por lo
          tanto SÍ anima— solo para la venta que se acaba de registrar. */}
      {ventas.map((v) => (
        <div key={v.venta_id} className="anim-revelar flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="text-tinta/60">{v.hora}</span>
          {integrante.has(v.vendedor) && (
            <span className="shrink-0 text-tinta" title={v.vendedor}>
              {integrante.get(v.vendedor)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-tinta/60">
            {v.comprobante_texto ?? "Sin comprobante"} {v.metodos_pago ? `· ${v.metodos_pago}` : ""}
          </span>
          {/* La nota de la venta («lo recoge el sábado…»), en la misma fila, truncada;
              el texto completo queda en `title`. Si la RPC no la trae —o producción aún no
              tiene la columna— no se pinta nada. */}
          {v.nota && (
            <span className="min-w-0 max-w-[16rem] truncate text-tinta/60 italic" title={v.nota}>
              {v.nota}
            </span>
          )}
          <span className="shrink-0 font-medium text-tinta">S/{Number(v.total).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
