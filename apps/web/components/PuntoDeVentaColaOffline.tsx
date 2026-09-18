"use client";

import { useState } from "react";
import { CloudOff, TriangleAlert } from "lucide-react";
import { money } from "@/components/PuntoDeVenta";
import { type VentaEncolada } from "@/lib/ventas-offline";

type Props = {
  cola: VentaEncolada[];
  onDescartar: (token: string) => void;
};

function totalDe(venta: VentaEncolada): number {
  return venta.params.p_items.reduce((acc, it) => acc + it.cantidad * (it.precio_unitario - it.descuento_unitario), 0);
}

/**
 * Banner de la cola offline (BACKLOG "resiliencia sin internet"; diseño ADR-0036 de V1,
 * adaptado). Separa dos estados bien distintos: lo que sigue sin red (el trío
 * mount/online/latido de `PuntoDeVenta.tsx` lo va a reintentar solo, nada que hacer acá)
 * y lo que el servidor rechazó de verdad (ej. la caja ya cerró) — eso NO se reintenta
 * solo (ADR-0036, addendum "Descartar": reintentar a ciegas repetiría el mismo rechazo
 * cada 30 s sin decir nada útil) y espera una decisión a mano.
 *
 * Sin estado de negocio propio — todo llega por props, mismo patrón que
 * `PuntoDeVentaTicket`/`PuntoDeVentaCatalogo` (ADR-0043). El único estado local es la
 * confirmación de dos pasos de "Descartar": nunca un solo click borra una venta.
 */
export function PuntoDeVentaColaOffline({ cola, onDescartar }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  if (cola.length === 0) return null;

  const pendientes = cola.filter((v) => v.rechazo === null);
  const rechazadas = cola.filter((v) => v.rechazo !== null);

  return (
    <div className="anim-revelar space-y-2 border-b border-sand bg-ambar/10 px-4 py-3 sm:px-6">
      {pendientes.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-ambar-profundo">
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          {pendientes.length === 1
            ? "1 venta guardada sin conexión en este equipo — subirá sola cuando vuelva el internet. No cierres esta pestaña."
            : `${pendientes.length} ventas guardadas sin conexión en este equipo — subirán solas cuando vuelva el internet. No cierres esta pestaña.`}
        </p>
      )}
      {rechazadas.map((venta) => (
        <div key={venta.token} className="flex flex-wrap items-center gap-2 rounded-lg border border-rojo/30 bg-crema px-3 py-2 text-xs text-rojo-profundo">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Una venta guardada sin conexión ({money(totalDe(venta))}) no pudo subir: {venta.rechazo}
          </span>
          {confirmando === venta.token ? (
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-tinta/70">¿Descartarla? No queda ningún rastro en el servidor.</span>
              <button
                type="button"
                onClick={() => {
                  onDescartar(venta.token);
                  setConfirmando(null);
                }}
                className="label-cayla h-7 rounded-md bg-rojo px-2 text-[11px] text-crema hover:bg-rojo-profundo"
              >
                Sí, descartar
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="label-cayla h-7 rounded-md border border-tinta/25 px-2 text-[11px] text-tinta hover:bg-sand/40"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(venta.token)}
              className="label-cayla h-7 shrink-0 rounded-md border border-rojo/40 px-2 text-[11px] text-rojo-profundo hover:bg-rojo/8"
            >
              Descartar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
