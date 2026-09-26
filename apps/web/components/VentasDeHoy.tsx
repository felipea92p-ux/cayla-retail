"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nombresCortos } from "@/lib/nombre-integrante";

/** Fila de `fn_ventas_del_dia` (0011_venta_con_comprobante.sql), con solo lo que la lista pinta. */
export type VentaDeHoy = {
  venta_id: string;
  hora: string;
  vendedor: string;
  comprobante_texto: string | null;
  metodos_pago: string | null;
  nota: string | null;
  total: number;
};

const MENSAJE_FALLO = "No se pudo cargar las ventas de hoy. Lo demás de esta pantalla sí está al día.";

/**
 * Las ventas de hoy de ESTA sede: arranca con lo que leyó el servidor y se relee cada vez que sube `version` (tras cada
 * venta, o cuando sube la cola sin conexión — ADR-0192). La usa el Punto de venta para la píldora «Hoy» de su cabecera
 * y para la lista que esa píldora abre (spike 2026-09-26): los dos leen lo MISMO, una sola vez.
 */
export function useVentasDeHoy(ubicacionId: string, inicial: VentaDeHoy[], falloInicial: string | null, version: number) {
  const [ventas, setVentas] = useState(inicial);
  const [fallo, setFallo] = useState(falloInicial);

  useEffect(() => {
    // Versión 0 = lo que trajo el servidor, ya está en pantalla. `fn_` es lectura: el loader global no se muestra.
    if (version === 0) return;
    let vigente = true;
    createClient()
      .rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId })
      .then(({ data, error }) => {
        if (!vigente) return;
        // Si la relectura falla se conserva la lista anterior con el aviso: la venta ya quedó bien en la base.
        if (error) setFallo(MENSAJE_FALLO);
        else {
          setFallo(null);
          setVentas(data ?? []);
        }
      });
    return () => {
      vigente = false;
    };
  }, [version, ubicacionId]);

  return { ventas, fallo };
}

/** La lista de ventas de hoy (solo pinta: los datos salen de `useVentasDeHoy`). */
export function VentasDeHoyLista({ ventas, fallo, ubicacionEtiqueta }: { ventas: VentaDeHoy[]; fallo: string | null; ubicacionEtiqueta: string }) {
  if (fallo && ventas.length === 0) {
    return <p className="card-cayla border-rojo/30 px-4 py-4 text-center text-xs text-rojo-profundo">{fallo}</p>;
  }

  if (ventas.length === 0) {
    return <p className="font-display card-cayla py-6 text-center text-sm text-tinta/60 italic">Aún no hay ventas hoy en {ubicacionEtiqueta}.</p>;
  }

  // Cada venta lleva la firma de la integrante que la hizo (primer nombre; inicial del
  // apellido solo si dos integrantes del día se llaman igual). `vendedor` vacío o el
  // relleno «—» de la RPC no es una integrante: no se pinta nada, no se inventa.
  const integrante = nombresCortos(ventas.map((v) => v.vendedor));

  return (
    <div className="card-cayla divide-y divide-sand !p-0">
      {fallo && <p className="px-4 py-2 text-center text-xs text-rojo-profundo">{fallo}</p>}
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
