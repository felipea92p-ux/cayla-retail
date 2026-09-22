"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { vendedorasDeTurno, type AsesoraDeTurno, type Vendedora } from "@/lib/vender-reglas";

type Estado = { vendedoras: Vendedora[]; sinAsistencia: boolean; noCargaron: boolean };

/**
 * La fila «Atendió» del Punto de venta: quiénes marcaron entrada hoy en Dynamic (`fn_asesoras_de_turno`,
 * reglas en `vendedorasDeTurno`). La pantalla queda abierta todo el día y la asistencia cambia (almuerzos,
 * turnos), así que se vuelve a preguntar cada `cadaMs` y al volver a la pestaña — mismo patrón que
 * `useCajaEnVivo`, sin sondear con la pestaña oculta ni sin red.
 *
 * Es un dato secundario: si la lectura falla se conserva la última lista buena y, si nunca hubo una, se
 * avisa (la venta saldrá a nombre de la sesión). `fn_` está en la lista de lectura de `espera-reglas.ts`,
 * así que el sondeo no enciende el loader.
 */
export function useVendedorasDeTurno(ubicacionId: string, cadaMs = 60_000): Estado {
  const [estado, setEstado] = useState<Estado>({ vendedoras: [], sinAsistencia: false, noCargaron: false });

  useEffect(() => {
    const supabase = createClient();
    let vivo = true;
    let yaCargo = false;

    async function leer() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const { data, error } = await supabase.rpc("fn_asesoras_de_turno", { p_ubicacion_id: ubicacionId });
      if (!vivo) return;
      if (error) {
        if (!yaCargo) setEstado((e) => ({ ...e, noCargaron: true }));
        return;
      }
      yaCargo = true;
      setEstado({ ...vendedorasDeTurno((data ?? []) as AsesoraDeTurno[]), noCargaron: false });
    }

    void leer();
    const id = window.setInterval(leer, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void leer();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [ubicacionId, cadaMs]);

  return estado;
}
