"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { selloDeCaja, hayNovedad } from "@/lib/caja-en-vivo";
import { useCambiosEnVivo } from "@/lib/useCambiosEnVivo";

/**
 * Mantiene el tablero de Caja al día sin que nadie recargue. Cada `cadaMs` le pide a la base el sello de la
 * caja (`fn_sello_caja`, ADR-0191: cuántas ventas, anuladas, movimientos, devoluciones y cambios tiene) —una
 * sola consulta, sin traer filas, con la misma regla de lectura que la RLS— y, solo si el sello cambió, le pide
 * a Next que vuelva a leer la pantalla (`router.refresh()`). Lo demás (los conteos, las gráficas, el aviso de "nueva venta") lo hacen los
 * componentes al recibir los datos nuevos.
 *
 * Sondeo + WebSocket (ADR-0603): `ventas` está en la publicación de Realtime desde `20261102212000`, así que una venta
 * nueva de la sede adelanta el sondeo al instante. Las demás tablas del sello (movimientos de caja, devoluciones,
 * cambios) no emiten, por eso el sondeo cada `cadaMs` se queda: es el respaldo de siempre (ADR-0018).
 *
 * No sondea con la pestaña oculta ni sin red (al volver a verla sondea de inmediato). Un sondeo que
 * falla no rompe el tablero: el siguiente reintenta.
 */
export function useCajaEnVivo(cajaId: string, ubicacionId: string, cadaMs = 5000) {
  const router = useRouter();
  // Una venta nueva de esta sede llega por WebSocket (ADR-0603) y adelanta el sondeo; el sello también cuenta movimientos,
  // devoluciones y cambios, que no emiten, así que el sondeo de `cadaMs` sigue igual.
  const sondearRef = useRef<(() => Promise<void>) | null>(null);
  useCambiosEnVivo({ tabla: "ventas", ubicacionId, alCambiar: () => void sondearRef.current?.() });
  useEffect(() => {
    const supabase = createClient();
    let previa: string | null = null;
    let enCurso = false;
    let vivo = true;
    // Retroceso: si el sondeo falla (sesión vencida, base caída) cada intento espera el doble que el anterior, hasta
    // 12 turnos (un minuto a 5 s), en vez de golpear cada 5 s algo que no responde. Un éxito lo reinicia.
    let fallos = 0;
    let saltar = 0;

    async function sondear() {
      // Sin mirar `navigator.onLine`: puede decir «sin red» con internet (caja de TRU, 2026-10-10). Sin red de verdad,
      // la lectura falla al instante y el retroceso de abajo espacia los intentos.
      if (enCurso || document.visibilityState !== "visible") return;
      if (saltar > 0) {
        saltar--;
        return;
      }
      enCurso = true;
      try {
        const res = await supabase.rpc("fn_sello_caja", { p_caja_id: cajaId });
        if (!vivo) return;
        const actual = selloDeCaja(res);
        if (actual === null) {
          fallos++;
          saltar = Math.min(2 ** fallos, 12) - 1;
        } else {
          fallos = 0;
          if (hayNovedad(previa, actual)) router.refresh();
          previa = actual;
        }
      } catch {
        fallos++;
        saltar = Math.min(2 ** fallos, 12) - 1;
      } finally {
        enCurso = false;
      }
    }

    sondearRef.current = sondear;
    void sondear();
    const id = window.setInterval(sondear, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      sondearRef.current = null;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cajaId, cadaMs, router]);
}
