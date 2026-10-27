"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esFirmaDesconocida } from "@/lib/plan-compra-propuesta-guardada";
import { RPC_MODELOS, leerModelos, type LecturaModelos } from "@/lib/plan-compra-modelos";

// Lee los modelos de una categoría para el paso 2 del Plan (ADR-0526). Se pide cuando la persona abre el paso 2 y no antes: son decenas de modelos con sus colores y tallas, y la mayoría de las veces
// nadie los abre. Es una lectura (`fn_…`): no abre el loader de pantalla completa. Si la base todavía no tiene la función (la web se publicó antes que la migración) NO es un fallo: no hay paso 2 que
// ofrecer. Si falla por otra razón, se dice (el paso 1 sigue ahí, intacto).

export type EstadoDeModelos =
  | { fase: "cargando" }
  | { fase: "lista"; lectura: LecturaModelos }
  /** La categoría no entra a los motores (bolsas, empaque): no se reparte en modelos. */
  | { fase: "fuera" }
  /** La base todavía no sabe del paso 2. */
  | { fase: "sin-soporte" }
  | { fase: "error"; mensaje: string };

export function useModelosDeLaCategoria(planId: string, categoriaId: string, activo: boolean): { estado: EstadoDeModelos; recargar: () => void } {
  const [intento, setIntento] = useState(0);
  const clave = `${planId}|${categoriaId}|${intento}`;
  // El resultado lleva la clave con que se pidió: al pedir de nuevo (o cambiar de categoría) el anterior deja de valer sin tener que «borrarlo» a mano dentro del efecto.
  const [resultado, setResultado] = useState<{ clave: string; estado: EstadoDeModelos } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    void createClient()
      .rpc(RPC_MODELOS as never, { p_plan_id: planId, p_categoria_id: categoriaId } as never)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          setResultado({ clave, estado: esFirmaDesconocida(error) ? { fase: "sin-soporte" } : { fase: "error", mensaje: error.message } });
          return;
        }
        const r = leerModelos(data);
        setResultado({ clave, estado: r === null ? { fase: "sin-soporte" } : r.estado === "fuera" ? { fase: "fuera" } : { fase: "lista", lectura: r.lectura } });
      });
    return () => {
      vigente = false;
    };
  }, [activo, clave, planId, categoriaId]);
  const estado: EstadoDeModelos = resultado?.clave === clave ? resultado.estado : { fase: "cargando" };
  return { estado, recargar: () => setIntento((i) => i + 1) };
}
