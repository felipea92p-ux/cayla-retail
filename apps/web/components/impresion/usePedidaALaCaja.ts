"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Cómo va la boleta que se mandó a la caja. */
export type EstadoPedida =
  | { fase: "pidiendo" }
  /** En la cola o ya tomada por la caja, todavía sin salir. */
  | { fase: "en-cola"; id: string }
  | { fase: "impresa"; id: string }
  | { fase: "error" };

/** Cada cuánto se pregunta si ya salió, y hasta cuándo (después, la hoja deja de preguntar y queda «En la cola de la caja»). */
const CADA_MS = 3000;
const HASTA_MS = 3 * 60 * 1000;

/**
 * Pide la boleta de una venta a la cola de la caja (`retail.pedir_impresion`, migración 20261116204000) y pregunta cada 3 s si
 * ya salió (`fn_impresion_estado`). Va con `x-espera: no`: pedir y preguntar no tapan la pantalla con el loader (ADR-0149).
 * Pedir dos veces la misma venta no la imprime dos veces: la base devuelve la misma pedida.
 */
export function usePedidaALaCaja(ventaId: string | null, activo: boolean) {
  const [estado, setEstado] = useState<EstadoPedida>({ fase: "pidiendo" });
  const [intento, setIntento] = useState(0);
  const vigente = useRef(true);

  useEffect(() => {
    if (!activo || !ventaId) return;
    vigente.current = true;
    const supabase = createClient();
    let reloj: number | undefined;
    const inicio = Date.now();

    const preguntar = async (id: string) => {
      if (!vigente.current) return;
      const { data } = await supabase.rpc("fn_impresion_estado" as never, { p_impresion_id: id } as never).setHeader("x-espera", "no");
      if (!vigente.current) return;
      if (data === "impresa") {
        setEstado({ fase: "impresa", id });
        return;
      }
      if (Date.now() - inicio < HASTA_MS) reloj = window.setTimeout(() => void preguntar(id), CADA_MS);
    };

    void (async () => {
      const { data, error } = await supabase.rpc("pedir_impresion" as never, { p_venta_id: ventaId } as never).setHeader("x-espera", "no");
      if (!vigente.current) return;
      if (error || typeof data !== "string") {
        setEstado({ fase: "error" });
        return;
      }
      setEstado({ fase: "en-cola", id: data });
      reloj = window.setTimeout(() => void preguntar(data), CADA_MS);
    })();

    return () => {
      vigente.current = false;
      window.clearTimeout(reloj);
    };
  }, [ventaId, activo, intento]);

  // Al reintentar vuelve a «Mandando a la caja» antes de pedir de nuevo (la primera vez ya arranca así).
  const reintentar = useCallback(() => {
    setEstado({ fase: "pidiendo" });
    setIntento((n) => n + 1);
  }, []);
  return { estado, reintentar };
}
