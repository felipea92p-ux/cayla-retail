"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/client";
import { alDiaConElServidor, conRelectura, lecturaDelServidor } from "./vender-hoy-reglas";

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

export const MENSAJE_FALLO_VENTAS_DE_HOY = "No se pudo cargar las ventas de hoy. Lo demás de esta pantalla sí está al día.";

/**
 * Las ventas de hoy de ESTA sede: arranca con lo que leyó el servidor y se relee cada vez que sube `version` (tras cada
 * venta, o cuando sube la cola sin conexión — ADR-0192). La usa el Punto de venta para la píldora «Hoy» de su cabecera
 * y para la lista que esa píldora abre (spike 2026-09-26): los dos leen lo MISMO, una sola vez.
 *
 * El componente que la usa NO se monta de nuevo al cambiar de sede (el selector solo hace `router.refresh()`): lo que el servidor
 * vuelve a leer llega como `inicial` nuevo y manda sobre lo de antes (`alDiaConElServidor`). Hasta el 2026-10-10 se tomaba solo al
 * montar, y con la cabecera en AQP la píldora seguía sumando las ventas de TRU.
 */
export function useVentasDeHoy(ubicacionId: string, inicial: VentaDeHoy[], falloInicial: string | null, version: number) {
  const [lectura, setLectura] = useState(() => lecturaDelServidor(ubicacionId, inicial, falloInicial));
  // Al dibujar, no en un efecto: ni un cuadro con las ventas de la sede de antes bajo el nombre de la nueva.
  const vigente = alDiaConElServidor(lectura, ubicacionId, inicial, falloInicial);
  if (vigente !== lectura) setLectura(vigente);

  useEffect(() => {
    // Versión 0 = lo que trajo el servidor, ya está en pantalla. `fn_` es lectura: el loader global no se muestra.
    if (version === 0) return;
    let sigue = true;
    createClient()
      .rpc("fn_ventas_del_dia", { p_ubicacion_id: ubicacionId })
      .then(({ data, error }) => {
        if (!sigue) return;
        setLectura((actual) => conRelectura(actual, ubicacionId, error ? { fallo: MENSAJE_FALLO_VENTAS_DE_HOY } : { ventas: data ?? [] }));
      });
    return () => {
      sigue = false;
    };
  }, [version, ubicacionId]);

  return { ventas: vigente.ventas, fallo: vigente.fallo };
}
