"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esFirmaDesconocida } from "@/lib/plan-compra-propuesta-guardada";
import { RPC_ENVIO, leerEnvio, type LecturaEnvio } from "@/lib/plan-compra-envio";

// Lee lo que el paso 2 guardado de una categoría manda a Compras y en qué estado están sus pedidos (ADR-0530). Se pide cuando la persona abre la pestaña «Enviar a Compras» y no antes: casi nadie la abre.
// Es una lectura (`fn_…`): no abre el loader de pantalla completa. Si la base todavía no tiene la función (la web se publicó antes que la migración) NO es un fallo: no hay envío que ofrecer. Si falla por otra
// razón, se dice (los pasos 1 y 2 siguen ahí, intactos).

export type EstadoDelEnvio =
  | { fase: "cargando" }
  | { fase: "lista"; lectura: LecturaEnvio }
  /** La base todavía no sabe de pedidos a Compras. */
  | { fase: "sin-soporte" }
  | { fase: "error"; mensaje: string };

export function useEnvioDeLaCategoria(planId: string, categoriaId: string, activo: boolean): { estado: EstadoDelEnvio; recargar: () => void } {
  const [intento, setIntento] = useState(0);
  const clave = `${planId}|${categoriaId}|${intento}`;
  // El resultado lleva la clave con que se pidió: al pedir de nuevo (o cambiar de categoría) el anterior deja de valer sin tener que «borrarlo» a mano dentro del efecto.
  const [resultado, setResultado] = useState<{ clave: string; estado: EstadoDelEnvio } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void createClient()
      .rpc(RPC_ENVIO as never, { p_plan_id: planId, p_categoria_id: categoriaId } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setResultado({ clave, estado: esFirmaDesconocida(error) ? { fase: "sin-soporte" } : { fase: "error", mensaje: error.message } });
          return;
        }
        const lectura = leerEnvio(data);
        setResultado({ clave, estado: lectura === null ? { fase: "sin-soporte" } : { fase: "lista", lectura } });
      });
    return () => {
      vigente = false;
    };
  }, [activo, clave, planId, categoriaId]);
  const estado: EstadoDelEnvio = resultado?.clave === clave ? resultado.estado : { fase: "cargando" };
  return { estado, recargar: () => setIntento((i) => i + 1) };
}
