"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firmaDeConteos, hayNovedad } from "@/lib/caja-en-vivo";

/**
 * Mantiene el tablero de Caja al día sin que nadie recargue. Cada `cadaMs` pregunta cuántas ventas y
 * cuántos movimientos tiene la caja —dos consultas de conteo, sin traer filas, con el mismo RLS que ya
 * usa el servidor— y, solo si el número cambió, le pide a Next que vuelva a leer la pantalla
 * (`router.refresh()`). Lo demás (los conteos, las gráficas, el aviso de "nueva venta") lo hacen los
 * componentes al recibir los datos nuevos.
 *
 * Por qué sondeo y no Supabase Realtime: Realtime hoy no está activo sobre ninguna tabla (ADR-0018) y
 * habilitarlo es un `alter publication` en el proyecto compartido con Dynamic, que se confirma con
 * Felipe antes de correrlo. El sondeo no toca la base y llega en pocos segundos; cuando se autorice
 * Realtime, esto se cambia por una suscripción sin tocar a quienes consumen los datos.
 *
 * No sondea con la pestaña oculta ni sin red (al volver a verla sondea de inmediato). Un sondeo que
 * falla no rompe el tablero: el siguiente reintenta.
 */
export function useCajaEnVivo(cajaId: string, cadaMs = 5000) {
  const router = useRouter();
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
      if (enCurso || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (saltar > 0) {
        saltar--;
        return;
      }
      enCurso = true;
      try {
        const [ventas, movimientos] = await Promise.all([
          supabase.from("ventas").select("id", { count: "exact", head: true }).eq("caja_id", cajaId),
          supabase.from("caja_movimientos").select("id", { count: "exact", head: true }).eq("caja_id", cajaId),
        ]);
        if (!vivo) return;
        const actual = firmaDeConteos(ventas, movimientos);
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

    void sondear();
    const id = window.setInterval(sondear, cadaMs);
    const alVolver = () => {
      if (document.visibilityState === "visible") void sondear();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cajaId, cadaMs, router]);
}
