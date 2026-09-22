"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FilaDeTurno } from "@/lib/responsable-reglas";

export type DeTurno = {
  /** La última lectura buena de `fn_asesoras_de_turno` (vacía hasta la primera). */
  filas: FilaDeTurno[];
  /** Ya llegó al menos una lectura buena. */
  cargo: boolean;
  /** La última lectura falló (se conserva la lista anterior, si la había). */
  fallo: boolean;
  /** Relee ahora (botón «Actualizar lista», o tras un rechazo de la base). */
  recargar: () => Promise<void>;
  recargando: boolean;
};

/**
 * Quién está en la tienda ahora, según la asistencia de Dynamic (`fn_asesoras_de_turno`). Nació para la fila
 * «Atendió» del Punto de venta (ADR-0163) y hoy alimenta el combo «Responsable» de toda operación de tienda
 * (ADR-0161). Las REGLAS de quién se ofrece viven en `listaResponsable` (lib/responsable-reglas.ts); esto solo lee.
 *
 * Una pantalla de tienda queda abierta todo el día y la asistencia cambia (almuerzos, turnos), así que se vuelve a
 * preguntar cada `cadaMs` y al volver a la pestaña — mismo patrón que `useCajaEnVivo`, sin sondear con la pestaña
 * oculta ni sin red. Si una lectura falla se conserva la última lista buena: una venta sin conexión sigue pudiendo
 * elegir a quien estaba presente. `fn_` está en la lista de lectura de `espera-reglas.ts`, así que el sondeo no
 * enciende el loader general.
 */
export function useDeTurno(ubicacionId: string | null, cadaMs = 60_000): DeTurno {
  const [filas, setFilas] = useState<FilaDeTurno[]>([]);
  const [cargo, setCargo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [recargando, setRecargando] = useState(false);
  const vivo = useRef(true);

  const leer = useCallback(
    async (forzar: boolean) => {
      if (!ubicacionId) return;
      if (!forzar && (document.visibilityState !== "visible" || !navigator.onLine)) return;
      const { data, error } = await createClient().rpc("fn_asesoras_de_turno", { p_ubicacion_id: ubicacionId });
      if (!vivo.current) return;
      if (error) {
        setFallo(true);
        return;
      }
      setFilas((data ?? []) as FilaDeTurno[]);
      setCargo(true);
      setFallo(false);
    },
    [ubicacionId],
  );

  useEffect(() => {
    vivo.current = true;
    // Cambió la sede activa: la lista anterior es de otra tienda y no sirve.
    /* eslint-disable react-hooks/set-state-in-effect */
    setFilas([]);
    setCargo(false);
    setFallo(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    void leer(false);
    const id = window.setInterval(() => void leer(false), cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void leer(false);
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [leer, cadaMs]);

  const recargar = useCallback(async () => {
    setRecargando(true);
    try {
      await leer(true);
    } finally {
      if (vivo.current) setRecargando(false);
    }
  }, [leer]);

  return { filas, cargo, fallo, recargar, recargando };
}
